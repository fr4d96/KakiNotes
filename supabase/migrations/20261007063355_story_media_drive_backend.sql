-- Google Drive upload backend, Round A (server/database/proxy only --
-- docs/google-drive-integration.md section 3 and section 4, step 2/4, and
-- section 5's RPC (c)). No editor UI wires into this yet (Round B).
--
-- NEVER APPLIED to any database as part of this task -- file only, per the
-- task's explicit instruction. Whoever applies this for real should run
-- `npm run supabase:types` / `:linked` afterwards to regenerate
-- types/database.ts.
--
-- NOTE on an unrelated in-flight migration: another, unmerged task has
-- 20261003120000_story_media_original_retention.sql already applied to the
-- shared dev database (adds `original_deleted_at` to story_media). That
-- migration is not in this repo/branch. This migration does not touch
-- original_deleted_at and does not reuse any of that migration's names, so
-- the two are independent and should apply cleanly in either order.
--
-- ---------------------------------------------------------------------------
-- 1. storage_backend -- per-image, not a global switch (section 3)
-- ---------------------------------------------------------------------------
--
-- Deliberately a plain `text ... check (...)`, not a new enum type, per
-- this task's own instruction -- the design doc's sketch uses an enum, but
-- a bare CHECK is simpler to extend later and matches the instruction given
-- for this slice.

alter table public.story_media
  add column storage_backend text not null default 'supabase'
    check (storage_backend in ('supabase', 'google_drive'));

comment on column public.story_media.storage_backend is
  'Which backend holds this image''s processed derivative. Set once, at upload time, from whether the uploading contributor had an active Drive connection -- never changes retroactively when a contributor connects/disconnects later (docs/google-drive-integration.md section 3). Existing rows default to supabase with no data change.';

-- ---------------------------------------------------------------------------
-- 2. Drive identity columns + nullable Supabase paths (section 3)
-- ---------------------------------------------------------------------------
--
-- private_storage_path is the only existing NOT NULL storage-path column on
-- this table (processed_private_storage_path and approved_public_storage_path
-- were already nullable, gated by the processing_state machine). A
-- google_drive row never has ANY Supabase storage path -- nothing is ever
-- written to either bucket for it -- so this is the one column that needs
-- its NOT NULL dropped.

alter table public.story_media
  alter column private_storage_path drop not null,
  add column drive_processed_file_id text,
  add column drive_folder_id text;

comment on column public.story_media.drive_processed_file_id is
  'The Drive file id of the processed derivative -- the ONLY file this feature ever writes for public/preview use. Set together with drive_folder_id, only once processing has succeeded (processing_state in processed/promotion_pending/promoted), by finalize_drive_media_upload(). Null for a supabase-backend row (story_media_backend_consistency) and null for a google_drive row that has not finished processing yet (story_media_drive_fields_require_processed_or_later).';
comment on column public.story_media.drive_folder_id is
  'The Drive folder (the contributor''s real, non-staging app folder) that currently holds drive_processed_file_id. A snapshot taken at write time, independent of contributor_drive_connections.drive_folder_id (which tracks the contributor''s CURRENT top-level folder) -- useful for audit/move-tool purposes even if a contributor''s folder setup changes later.';

-- ---------------------------------------------------------------------------
-- 3. Consistency constraints
-- ---------------------------------------------------------------------------
--
-- story_media_backend_consistency: a supabase row keeps exactly what it has
-- today (private_storage_path required, no Drive ids); a google_drive row
-- has no Supabase storage path of any kind, ever -- not a draft path, not a
-- processed-derivative path, not a published-copy path.

alter table public.story_media
  add constraint story_media_backend_consistency check (
    (storage_backend = 'supabase'
      and private_storage_path is not null
      and drive_processed_file_id is null
      and drive_folder_id is null)
    or
    (storage_backend = 'google_drive'
      and private_storage_path is null
      and processed_private_storage_path is null
      and approved_public_storage_path is null)
  );

comment on constraint story_media_backend_consistency on public.story_media is
  'A supabase row keeps today''s exact shape (private_storage_path required, no Drive ids). A google_drive row never has any Supabase storage path -- the processed derivative lives ONLY in Drive (drive_processed_file_id), never briefly copied into either bucket.';

-- story_media_drive_fields_require_processed_or_later: mirrors the existing
-- story_media_processed_fields_require_processed_or_later pattern (same
-- "fields <-> state" biconditional shape) -- a google_drive row's Drive ids
-- exist only once processing has actually produced a derivative, never
-- during pending_upload/uploaded/processing, and (via the OR above) never
-- at all for a supabase row.

alter table public.story_media
  add constraint story_media_drive_fields_require_processed_or_later check (
    (drive_processed_file_id is not null and drive_folder_id is not null)
    = (storage_backend = 'google_drive' and processing_state in ('processed', 'promotion_pending', 'promoted'))
  );

comment on constraint story_media_drive_fields_require_processed_or_later on public.story_media is
  'A google_drive row''s drive_processed_file_id/drive_folder_id are set together, only once processing_state has reached processed-or-later -- set exclusively by finalize_drive_media_upload().';

-- 20260804090000_story_media_processing_state.sql's own
-- story_media_processed_fields_require_processed_or_later required
-- processed_private_storage_path is not null whenever processing_state is
-- processed-or-later -- unconditionally true because every row was
-- supabase-backend at the time. A google_drive row reaching 'processed'
-- must have processed_private_storage_path NULL (story_media_backend_
-- consistency above), which the original constraint can never satisfy. It
-- is replaced, not merely widened, so the supabase-row behavior is exactly
-- byte-for-byte what it was before this migration, with a google_drive
-- alternative added alongside it.
alter table public.story_media
  drop constraint story_media_processed_fields_require_processed_or_later;

alter table public.story_media
  add constraint story_media_processed_fields_require_processed_or_later check (
    (
      processed_mime_type is not null
      and processed_file_size_bytes is not null
      and processed_width is not null
      and processed_height is not null
      and sha256 is not null
      and metadata_removed_at is not null
      and source_mime_type is not null
      and source_width is not null
      and source_height is not null
      and (
        (storage_backend = 'supabase' and processed_private_storage_path is not null)
        or (storage_backend = 'google_drive' and processed_private_storage_path is null)
      )
    ) = (processing_state in ('processed', 'promotion_pending', 'promoted'))
  );

comment on constraint story_media_processed_fields_require_processed_or_later on public.story_media is
  'Every derived field required once processing_state reaches processed-or-later, same as before this migration for a supabase row (processed_private_storage_path required not null); a google_drive row instead requires processed_private_storage_path NULL, since its derivative lives only in Drive.';

-- story_media_approved_path_requires_promoted (20260804090000) tied
-- processing_state = 'promoted' to approved_public_storage_path being
-- non-null -- unconditionally true because every row was supabase-backend
-- at the time. A google_drive row can reach 'promoted' (section 8 below)
-- but can NEVER have approved_public_storage_path (story_media_backend_
-- consistency forbids it) -- there is no bucket copy to point at, the
-- derivative IS the public file, served by the proxy. Replaced, not
-- widened: the supabase-row behavior (the exact biconditional) is
-- unchanged; a google_drive row instead requires the column to stay NULL
-- regardless of state.
alter table public.story_media
  drop constraint story_media_approved_path_requires_promoted;

alter table public.story_media
  add constraint story_media_approved_path_requires_promoted check (
    (storage_backend = 'supabase'
      and (approved_public_storage_path is not null) = (processing_state = 'promoted'))
    or
    (storage_backend = 'google_drive' and approved_public_storage_path is null)
  );

comment on constraint story_media_approved_path_requires_promoted on public.story_media is
  'Supabase row: unchanged biconditional (approved_public_storage_path set iff promoted). Google Drive row: approved_public_storage_path stays NULL in every state, including promoted -- the processed derivative in Drive IS the public file; there is no bucket copy to record a path for.';

-- Rule 11: a Drive photo''s file identity must be immutable once published,
-- same as a supabase photo''s approved_public_storage_path/processed_* are
-- (checked below in story_media_validate_processing_state_transition,
-- redefined in section 8). Nothing in the original definition (20260804090000)
-- protected drive_processed_file_id/drive_folder_id -- they did not exist
-- yet -- so this is a gap being closed here, not a re-litigation of
-- existing behavior.

-- ---------------------------------------------------------------------------
-- 4. RPC (a): begin a Drive-mode media reservation
-- ---------------------------------------------------------------------------
--
-- Mirrors begin_story_media_upload's shape and style exactly (same
-- _authorize_revision_edit call, same revision-row lock before the
-- count check, same 12-image limit), with two differences: no storage path
-- is reserved (there is nothing to reserve -- Option D's raw bytes go
-- straight into the contributor's own Drive, never a Supabase bucket), and
-- it independently re-derives "does this caller actually have an active
-- Drive connection" from contributor_drive_connections itself (never from
-- a client-supplied flag -- Engineering Rule 2) rather than trusting the
-- caller of this RPC to have already checked lib/drive/connection-status.ts.
-- SECURITY DEFINER functions run as this function's owner, which is how it
-- can read contributor_drive_connections at all despite that table's
-- deny-all RLS for every other role.

-- MUST-FIX 2 (round A review, 2026-10-07): "whose Drive". _authorize_
-- revision_edit() alone would let an assigned EDITOR with their own active
-- Drive connection upload into a CONTRIBUTOR's story -- the photo would
-- land in the editor's personal Drive, breaking the moment that editor
-- disconnects, and contradicting the whole design (the contributor's own
-- Drive is the only place these bytes are meant to live). Drive mode is
-- therefore narrowed to self_submitted stories, and only the story's own
-- owner_user_id -- never an assigned editor, admin, or an editorial-import
-- contributor (even a linked one) -- the same "my own story" relationship
-- list_my_stories()/_is_story_owner() already treat as authoritative for
-- a self_submitted story, just without the editorial_import branch _is_
-- story_owner() also allows.
create or replace function public._is_self_submitted_story_owner(p_story_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.stories s
    where s.id = p_story_id
      and s.source_kind = 'self_submitted'
      and s.owner_user_id = auth.uid()
  );
$$;

comment on function public._is_self_submitted_story_owner(uuid) is
  'Internal: true only for a self_submitted story''s own owner_user_id -- never an assigned editor, admin, or an editorial_import contributor (linked or not). The Drive-mode gate: Drive photos live ONLY in the uploading contributor''s own Drive, so only that exact person may use Drive mode for their own story, regardless of who else could otherwise edit it. No API grants.';

revoke execute on function public._is_self_submitted_story_owner(uuid) from public, anon, authenticated;

create or replace function public.begin_drive_media_upload(
  p_revision_id uuid,
  p_source_mime_type text
)
returns table (media_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_story_id uuid;
  v_media_id uuid;
  v_attached_count integer;
  v_pending_count integer;
  max_images_per_revision constant integer := 12;
begin
  select public._authorize_revision_edit(p_revision_id) into v_story_id;

  if not public._is_self_submitted_story_owner(v_story_id) then
    raise exception 'Drive mode is only available to a self-submitted story''s own contributor';
  end if;

  if not exists (
    select 1 from public.contributor_drive_connections
    where user_id = auth.uid() and status = 'active'
  ) then
    raise exception 'No active Google Drive connection for this user';
  end if;

  if p_source_mime_type not in ('image/jpeg', 'image/png', 'image/webp', 'image/heic') then
    raise exception 'Unsupported source MIME type: %', p_source_mime_type;
  end if;

  perform 1 from public.story_revisions where id = p_revision_id for update;

  select count(*) into v_attached_count
  from public.story_revision_media where revision_id = p_revision_id;
  select count(*) into v_pending_count
  from public.story_media
  where reserved_for_revision_id = p_revision_id and processing_state = 'pending_upload';

  if v_attached_count + v_pending_count >= max_images_per_revision then
    raise exception 'Revision % already has % images attached or reserved (max %)',
      p_revision_id, v_attached_count + v_pending_count, max_images_per_revision;
  end if;

  v_media_id := gen_random_uuid();

  insert into public.story_media (
    id, story_id, owner_user_id, uploaded_by, storage_backend, source_mime_type,
    reserved_for_revision_id, processing_state
  )
  select
    v_media_id, v_story_id,
    case when s.source_kind = 'self_submitted' then auth.uid() else null end,
    auth.uid(), 'google_drive', p_source_mime_type, p_revision_id, 'pending_upload'
  from public.stories s where s.id = v_story_id;

  return query select v_media_id;
end;
$$;

comment on function public.begin_drive_media_upload(uuid, text) is
  'Drive-mode sibling of begin_story_media_upload: reserves a media slot (storage_backend = google_drive) with NO storage path, since Option D''s raw bytes never touch a Supabase bucket. Independently re-checks for an active Drive connection server-side -- never trusts a client-supplied "I am in Drive mode" flag. Same 12-image-per-revision limit, enforced the same way (lock then count).';

revoke execute on function public.begin_drive_media_upload(uuid, text) from public, anon, authenticated;
grant execute on function public.begin_drive_media_upload(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. RPC (b): record a finished Drive upload
-- ---------------------------------------------------------------------------
--
-- Combines what finalize_story_media_upload + record_processed_story_media
-- do for the Supabase path into one call, because drive-sync.ts's caller
-- (lib/story/drive-sync.ts#finalizeDriveMediaUpload) only calls into the
-- database ONCE it already has a verified, fully-processed derivative in
-- hand (download -> pipeline -> upload already happened in-process,
-- entirely in server memory, before this is ever called) -- there is no
-- separate "uploaded" moment analogous to the Supabase flow's direct-to-
-- storage browser upload. The processing_state machine still walks through
-- pending_upload -> uploaded -> processing -> processed as three ordinary
-- UPDATEs inside this one function, so story_media_validate_processing_
-- state_transition (unchanged) validates every step exactly as it would
-- for any other caller.
--
-- 30-minute reservation expiry (decision Q12, section 4(b)/12): checked
-- against created_at rather than a separate expiry column -- a
-- pending_upload row's created_at IS its reservation time, since nothing
-- else about it changes before this function runs. A later cleanup sweep
-- (section 11 slice 4, not built in this round) is what actually reclaims
-- an abandoned reservation past this window; this check only stops a
-- stale call from finalizing past it.

create or replace function public.finalize_drive_media_upload(
  p_media_id uuid,
  p_expected_version integer,
  p_drive_processed_file_id text,
  p_drive_folder_id text,
  p_source_mime_type text,
  p_source_width integer,
  p_source_height integer,
  p_source_file_size_bytes bigint,
  p_processed_mime_type text,
  p_processed_file_size_bytes bigint,
  p_processed_width integer,
  p_processed_height integer,
  p_sha256 text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_media public.story_media;
  v_story_id uuid;
  v_story public.stories;
  v_next_sort integer;
  reservation_ttl constant interval := interval '30 minutes';
begin
  select * into v_media from public.story_media where id = p_media_id for update;
  if not found then
    raise exception 'No such media: %', p_media_id;
  end if;
  if v_media.storage_backend <> 'google_drive' then
    raise exception 'Media % is not a Drive-mode reservation', p_media_id;
  end if;

  -- Idempotent: a prior call already succeeded for this exact media.
  if v_media.processing_state <> 'pending_upload' then
    return;
  end if;

  if v_media.created_at < now() - reservation_ttl then
    raise exception 'Drive upload reservation for media % has expired', p_media_id;
  end if;

  -- Re-derive edit authorization independently -- never trust that
  -- begin_drive_media_upload's earlier check is still valid.
  select public._authorize_revision_edit(v_media.reserved_for_revision_id) into v_story_id;

  -- MUST-FIX 2: re-derive the Drive-mode ownership gate here too, not only
  -- in begin_drive_media_upload -- a DB function must never rely on an
  -- earlier call having checked something, including one of its own
  -- siblings.
  if not public._is_self_submitted_story_owner(v_story_id) then
    raise exception 'Drive mode is only available to a self-submitted story''s own contributor';
  end if;

  select * into v_story from public.stories where id = v_story_id;
  if v_story.version <> p_expected_version then
    raise exception 'Stale version for story % (expected %, got %)', v_story_id, v_story.version, p_expected_version;
  end if;

  perform 1 from public.story_revisions where id = v_media.reserved_for_revision_id for update;

  select coalesce(max(sort_order), -1) + 1 into v_next_sort
  from public.story_revision_media where revision_id = v_media.reserved_for_revision_id;

  -- decorative = true placeholder, same reasoning as finalize_story_media_
  -- upload (20260926110716): no alt text has been collected yet.
  insert into public.story_revision_media (revision_id, media_id, decorative, sort_order)
  values (v_media.reserved_for_revision_id, p_media_id, true, v_next_sort);

  update public.story_media
    set source_file_size_bytes = p_source_file_size_bytes,
        processing_state = 'uploaded'
    where id = p_media_id;

  update public.story_media
    set processing_state = 'processing',
        processing_started_at = now()
    where id = p_media_id;

  update public.story_media
    set processing_state = 'processed',
        source_mime_type = p_source_mime_type,
        source_width = p_source_width,
        source_height = p_source_height,
        processed_mime_type = p_processed_mime_type,
        processed_file_size_bytes = p_processed_file_size_bytes,
        processed_width = p_processed_width,
        processed_height = p_processed_height,
        sha256 = p_sha256,
        metadata_removed_at = now(),
        drive_processed_file_id = p_drive_processed_file_id,
        drive_folder_id = p_drive_folder_id
    where id = p_media_id;

  update public.stories set version = version + 1 where id = v_story_id;
end;
$$;

comment on function public.finalize_drive_media_upload(uuid, integer, text, text, text, integer, integer, bigint, text, bigint, integer, integer, text) is
  'Records a Drive-mode upload whose derivative has ALREADY been produced and written to Drive by lib/story/drive-sync.ts (download -> verify -> pipeline -> Drive upload all happened first, entirely in server memory). Walks processing_state pending_upload -> uploaded -> processing -> processed as three ordinary updates, re-validated by the existing transition trigger. Refuses a reservation older than 30 minutes. Idempotent past pending_upload.';

revoke execute on function public.finalize_drive_media_upload(uuid, integer, text, text, text, integer, integer, bigint, text, bigint, integer, integer, text) from public, anon, authenticated;
grant execute on function public.finalize_drive_media_upload(uuid, integer, text, text, text, integer, integer, bigint, text, bigint, integer, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. RPC (c): the proxy's lookup
-- ---------------------------------------------------------------------------
--
-- Mirrors get_published_story_media's own discipline for the anonymous
-- branch (re-derives published_revision_id by name, never a join across
-- draft/pending/rejected state -- Rule 10) exactly, scoped to
-- storage_backend = 'google_drive' rows only, OR falls back to
-- _can_access_story_media() (the SAME rule the existing private-preview
-- flow already uses) for a contributor/moderator preview. A supabase row,
-- or a google_drive row that fails BOTH checks, returns zero rows --
-- indistinguishable from "no such media" to the caller, which is exactly
-- what app/media/[mediaId]/route.ts needs to answer anon/preview/supabase
-- with an identical 404 body.
--
-- MUST-FIX 2 (round A review): returns the STORY's owner_user_id as the
-- token owner, not story_media.uploaded_by. Now that begin_drive_media_
-- upload/finalize_drive_media_upload both require the caller to be the
-- self_submitted story's own owner_user_id, the two columns are always
-- equal in practice -- but the proxy's correctness should rest on the
-- story's own authoritative ownership column, re-derived fresh, not on an
-- upload-time snapshot column staying consistent forever by convention.

create or replace function public.get_drive_media_for_proxy(p_media_id uuid)
returns table (
  media_id uuid,
  drive_processed_file_id text,
  processed_mime_type text,
  owner_user_id uuid,
  is_published boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_media public.story_media;
  v_story public.stories;
  v_published boolean := false;
begin
  select * into v_media from public.story_media where id = p_media_id;
  if not found or v_media.storage_backend <> 'google_drive' or v_media.drive_processed_file_id is null then
    return;
  end if;

  select * into v_story from public.stories where id = v_media.story_id;

  if v_story.visibility = 'public'
    and v_story.lifecycle_status = 'published'
    and v_story.published_revision_id is not null
    and v_story.consent_revoked_at is null
    and exists (
      select 1 from public.story_revision_media rm
      where rm.media_id = p_media_id and rm.revision_id = v_story.published_revision_id
    )
    and public._latest_valid_consent_for_revision(v_story.id, v_story.published_revision_id) is not null
  then
    v_published := true;
  end if;

  if not v_published and not public._can_access_story_media(p_media_id) then
    return;
  end if;

  return query select v_media.id, v_media.drive_processed_file_id, v_media.processed_mime_type, v_story.owner_user_id, v_published;
end;
$$;

comment on function public.get_drive_media_for_proxy(uuid) is
  'The Drive proxy route''s one lookup (app/media/[mediaId]/route.ts). Returns zero rows for: a non-existent media id, a supabase-backend row (always, regardless of auth), a google_drive row with no derivative yet, OR a google_drive row that is neither on its story''s published_revision_id (re-derived by name, never joined across draft/pending/rejected state -- Rule 10) with valid, non-revoked consent, NOR accessible to the caller via _can_access_story_media() (owner/linked-contributor/assigned-editor/admin/reviewing-moderator). owner_user_id in the result is the STORY''s own owner_user_id (round A review MUST-FIX 2) -- Drive mode is restricted to a self_submitted story''s own owner, so this is always the contributor whose Drive connection actually holds the bytes -- and is only ever returned for a row this function has already authorized; never exposed to the HTTP response, only used server-side to look up that contributor''s token. is_published tells the route which Cache-Control to use: true only when the anonymous/published branch matched (never set merely because the caller happens to also have preview access).';

revoke execute on function public.get_drive_media_for_proxy(uuid) from public, anon, authenticated;
grant execute on function public.get_drive_media_for_proxy(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Small helper RPC: pre-check for finalizeDriveMediaUpload
-- ---------------------------------------------------------------------------
--
-- Not one of the three RPCs this round's task named explicitly, but needed
-- to satisfy its own instruction that finalize "re-derive the user and
-- check edit rights through the RPC" as a step BEFORE ever calling Drive's
-- API for this reservation -- the forged-file-id rejection case (next
-- section) must not download/delete anything, and this is what lets
-- lib/story/drive-sync.ts fail fast, before any Drive call, when the
-- caller has no edit rights on the reservation at all (not merely "the
-- Drive file didn't match"). Authorize-only, no output, same shape as the
-- existing authorize_story_media_preview().

create or replace function public.authorize_drive_media_finalize(p_media_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_media public.story_media;
begin
  select * into v_media from public.story_media where id = p_media_id;
  if not found then
    raise exception 'No such media: %', p_media_id;
  end if;
  if v_media.storage_backend <> 'google_drive' then
    raise exception 'Media % is not a Drive-mode reservation', p_media_id;
  end if;
  if v_media.processing_state <> 'pending_upload' then
    raise exception 'Media % is not a pending Drive upload reservation', p_media_id;
  end if;
  if v_media.created_at < now() - interval '30 minutes' then
    raise exception 'Drive upload reservation for media % has expired', p_media_id;
  end if;

  -- Raises on its own if the caller has no edit rights on the reserving
  -- revision -- same rule begin_drive_media_upload/finalize_drive_media_
  -- upload use, re-derived independently here too (never cached from an
  -- earlier call).
  perform public._authorize_revision_edit(v_media.reserved_for_revision_id);

  -- MUST-FIX 2: the Drive-mode ownership gate, re-derived here too.
  if not public._is_self_submitted_story_owner(v_media.story_id) then
    raise exception 'Drive mode is only available to a self-submitted story''s own contributor';
  end if;
end;
$$;

comment on function public.authorize_drive_media_finalize(uuid) is
  'Authorize-only pre-check for lib/story/drive-sync.ts#finalizeDriveMediaUpload, called BEFORE any Drive API call for this reservation: re-derives edit rights on the reserving revision, and checks the reservation is still a pending, unexpired, google_drive-backend row. Raises (never returns a reason) on any failure, so nothing about WHY is exposed to the caller beyond "not allowed".';

revoke execute on function public.authorize_drive_media_finalize(uuid) from public, anon, authenticated;
grant execute on function public.authorize_drive_media_finalize(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. MUST-FIX 1 (round A review, 2026-10-07): a Drive photo can actually
--    be published. finalize_story_publication() (20260804090400) raised
--    "Media % is not ready for publication" for any attached media that
--    wasn't already 'promoted' or 'promotion_pending' with a verified
--    public copy -- a google_drive row sits at 'processed' forever (there
--    is never a bucket copy to make for it), so approving a revision with
--    ANY Drive photo failed outright. Fixed end to end below:
--      8a. story_media_validate_processing_state_transition: a new direct
--          processed -> promoted transition for google_drive rows only
--          (supabase rows are untouched: they still only ever reach
--          promoted via promotion_pending), plus drive_processed_file_id/
--          drive_folder_id added to the promoted-row immutability guard
--          (Rule 11 -- a Drive photo's file identity can't change once
--          published, same protection approved_public_storage_path/
--          processed_* already had).
--      8b. finalize_story_publication: a google_drive row attached at
--          'processed' is promoted directly (no copy-attempt lookup, no
--          approved_public_storage_path -- there is nothing to copy, the
--          derivative IS the public file, served by the proxy). A
--          supabase row's path is completely unchanged.
--      8c. get_published_story_media / list_published_stories /
--          get_story_for_moderator: read paths that assumed a promoted
--          row has approved_public_storage_path, so a published Drive
--          photo would otherwise be silently invisible (missing from the
--          gallery, missing from the cover, "Images processed" stuck
--          false forever). Each now carries enough (storage_backend
--          and/or a media id) for getImageUrl() to build /media/<id> for
--          a Drive row, never a bucket path. Supabase-row output is
--          unchanged in every case -- additive columns only, same rows,
--          same values.
-- ---------------------------------------------------------------------------

-- 8a. Transition trigger (originally 20260804090000, body unchanged since).
create or replace function public.story_media_validate_processing_state_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.processing_state = new.processing_state then
    if old.processing_state = 'promoted' then
      if new.approved_public_storage_path is distinct from old.approved_public_storage_path
        or new.processed_private_storage_path is distinct from old.processed_private_storage_path
        or new.processed_mime_type is distinct from old.processed_mime_type
        or new.processed_file_size_bytes is distinct from old.processed_file_size_bytes
        or new.processed_width is distinct from old.processed_width
        or new.processed_height is distinct from old.processed_height
        or new.sha256 is distinct from old.sha256
        -- Rule 11, round A review MUST-FIX 1: a promoted Drive row's file
        -- identity is immutable too -- these two columns did not exist
        -- when this trigger was first written, so nothing protected them
        -- until now.
        or new.drive_processed_file_id is distinct from old.drive_processed_file_id
        or new.drive_folder_id is distinct from old.drive_folder_id
      then
        raise exception 'story_media % is promoted and its recorded values are immutable', old.id;
      end if;
    end if;
    return new;
  end if;

  if not (
    (old.processing_state = 'pending_upload' and new.processing_state = 'uploaded')
    or (old.processing_state = 'uploaded' and new.processing_state = 'processing')
    or (old.processing_state = 'processing' and new.processing_state in ('processed', 'failed'))
    or (old.processing_state = 'failed' and new.processing_state = 'processing')
    or (old.processing_state = 'processed' and new.processing_state = 'promotion_pending')
    or (old.processing_state = 'promotion_pending' and new.processing_state in ('processed', 'promoted'))
    -- NEW: a google_drive row goes straight from processed to promoted --
    -- there is no promotion_pending/copy-attempt step for it (8b below),
    -- since there is no bucket copy to make. A supabase row never matches
    -- this branch (old.storage_backend = 'supabase' here would need
    -- old.processing_state = 'processed' and new = 'promoted', which
    -- finalize_story_publication never does for a supabase row -- it
    -- always routes a supabase row through promotion_pending first).
    or (old.processing_state = 'processed' and new.processing_state = 'promoted'
        and old.storage_backend = 'google_drive')
  ) then
    raise exception 'story_media % cannot transition from % to %', old.id, old.processing_state, new.processing_state;
  end if;

  return new;
end;
$$;

comment on function public.story_media_validate_processing_state_transition() is
  'Explicit state-machine guard. Supabase rows: unchanged (pending_upload -> uploaded -> processing -> processed|failed -> promotion_pending -> promoted), and a promoted row''s approved_public_storage_path/processed_*/sha256 stay immutable. Google Drive rows additionally allow processed -> promoted directly (no copy-attempt step exists for Drive), and a promoted row''s drive_processed_file_id/drive_folder_id are immutable too (Rule 11, round A review MUST-FIX 1).';

-- 8b. finalize_story_publication (originally 20260804090400). Only the
-- per-media loop body changes; everything else (attempt/revision locking,
-- idempotency, consent check, moderation_actions insert, attempt
-- resolution) is byte-for-byte the original.
create or replace function public.finalize_story_publication(
  p_revision_id uuid,
  p_approval_attempt_id uuid,
  p_user_facing_reason text default null,
  p_editor_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.story_publication_attempts;
  v_revision public.story_revisions;
  v_story public.stories;
  v_old_published_revision_id uuid;
  v_rm record;
  v_copy public.story_media_public_copy_attempts;
  v_action_id uuid;
begin
  select * into v_attempt from public.story_publication_attempts
    where id = p_approval_attempt_id for update;
  if not found then
    raise exception 'No such publication attempt: %', p_approval_attempt_id;
  end if;
  if v_attempt.revision_id <> p_revision_id then
    raise exception 'Publication attempt % does not belong to revision %', p_approval_attempt_id, p_revision_id;
  end if;
  if not (v_attempt.initiated_by = auth.uid() or public.has_role(auth.uid(), 'admin')) then
    raise exception 'Only the initiating moderator or an admin may finalize this publication attempt';
  end if;
  if v_attempt.status = 'finalized' then
    return;
  end if;
  if v_attempt.status <> 'active' then
    raise exception 'Publication attempt % has already been resolved (%)', p_approval_attempt_id, v_attempt.status;
  end if;

  select * into v_revision from public.story_revisions where id = p_revision_id for update;
  if not found then raise exception 'No such revision: %', p_revision_id; end if;
  if v_revision.revision_status <> 'submitted' then
    raise exception 'Revision % is not currently submitted', p_revision_id;
  end if;
  select * into v_story from public.stories where id = v_revision.story_id for update;

  if public._latest_valid_consent_for_revision(v_story.id, p_revision_id) is null then
    raise exception 'Revision % has no currently-valid consent grant', p_revision_id;
  end if;

  v_old_published_revision_id := v_story.published_revision_id;

  for v_rm in
    select rm.media_id, m.processing_state, m.storage_backend
    from public.story_revision_media rm
    join public.story_media m on m.id = rm.media_id
    where rm.revision_id = p_revision_id
  loop
    if v_rm.processing_state = 'promoted' then
      continue; -- reused, unchanged media from a prior publication
    end if;

    -- NEW: a google_drive row needs no copy -- the processed derivative in
    -- Drive already IS the public file. Promote it directly from
    -- 'processed' (8a's new transition); approved_public_storage_path is
    -- never touched (story_media_approved_path_requires_promoted forbids
    -- it for a google_drive row, in any state).
    if v_rm.storage_backend = 'google_drive' then
      if v_rm.processing_state <> 'processed' then
        raise exception 'Media % is not ready for publication (state %)', v_rm.media_id, v_rm.processing_state;
      end if;
      update public.story_media
        set processing_state = 'promoted'
        where id = v_rm.media_id;
      continue;
    end if;

    if v_rm.processing_state <> 'promotion_pending' then
      raise exception 'Media % is not ready for publication (state %)', v_rm.media_id, v_rm.processing_state;
    end if;

    select * into v_copy from public.story_media_public_copy_attempts
      where media_id = v_rm.media_id and approval_attempt_id = p_approval_attempt_id;
    if not found or v_copy.status <> 'verified' then
      raise exception 'Media % has no verified copy for this publication attempt', v_rm.media_id;
    end if;

    update public.story_media
      set approved_public_storage_path = v_copy.public_path, processing_state = 'promoted'
      where id = v_rm.media_id;

    update public.story_media_public_copy_attempts
      set resolved_at = now(), resolution = 'promoted'
      where id = v_copy.id;
  end loop;

  update public.story_revisions
    set revision_status = 'approved', approved_at = now(), updated_by = auth.uid()
    where id = p_revision_id;

  if v_old_published_revision_id is not null then
    update public.story_revisions set revision_status = 'superseded', updated_by = auth.uid()
      where id = v_old_published_revision_id;
  end if;

  update public.stories
    set published_revision_id = p_revision_id,
        current_draft_revision_id = null,
        lifecycle_status = 'published',
        visibility = 'public',
        published_at = coalesce(published_at, now()),
        version = version + 1
    where id = v_story.id;

  insert into public.moderation_actions (
    story_id, revision_id, moderator_id, previous_status, new_status, user_facing_reason
  )
  values (v_story.id, p_revision_id, auth.uid(), 'submitted', 'approved', p_user_facing_reason)
  returning id into v_action_id;

  if p_editor_note is not null and char_length(p_editor_note) > 0 then
    insert into public.moderation_action_notes (action_id, internal_note, created_by)
    values (v_action_id, p_editor_note, auth.uid());
  end if;

  update public.story_publication_attempts
    set status = 'finalized', resolved_at = now(), updated_at = now()
    where id = p_approval_attempt_id;
end;
$$;

comment on function public.finalize_story_publication(uuid, uuid, text, text) is
  'The single atomic publication transaction. Accepts each attached media item either already promoted (reused unchanged), a supabase row at promotion_pending with a verified copy for this exact attempt (promoted here, as before), or (round A review MUST-FIX 1) a google_drive row at processed (promoted directly here, no copy involved -- the derivative in Drive already is the public file). No expectedVersion parameter: submitted revisions are already immutable. Idempotent: retrying an already-finalized attempt is a safe no-op.';

revoke execute on function public.finalize_story_publication(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.finalize_story_publication(uuid, uuid, text, text) to authenticated;

-- 8c-i. get_published_story_media (originally 20260803090800): a
-- published google_drive row was previously excluded from the result set
-- entirely (WHERE approved_public_storage_path is not null), so a
-- published Drive photo was invisible in the gallery/content-block images.
-- Shape change (new storage_backend column, appended last) -- DROP+CREATE,
-- same convention 20260805100900 used for its own shape changes.
drop function if exists public.get_published_story_media(uuid);

create function public.get_published_story_media(p_story_id uuid)
returns table (
  media_id uuid,
  public_url text,
  alt_text text,
  caption text,
  decorative boolean,
  sort_order integer,
  is_cover boolean,
  storage_backend text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_story public.stories;
begin
  select * into v_story from public.stories
    where id = p_story_id and visibility = 'public' and lifecycle_status = 'published';
  if not found or v_story.published_revision_id is null or v_story.consent_revoked_at is not null then
    return;
  end if;
  if public._latest_valid_consent_for_revision(v_story.id, v_story.published_revision_id) is null then
    return;
  end if;

  return query
    select m.id, m.approved_public_storage_path, rm.alt_text, rm.caption, rm.decorative,
           rm.sort_order, rm.is_cover, m.storage_backend
    from public.story_revision_media rm
    join public.story_media m on m.id = rm.media_id
    where rm.revision_id = v_story.published_revision_id
      and (
        (m.storage_backend = 'supabase' and m.approved_public_storage_path is not null and m.metadata_removed_at is not null)
        or (m.storage_backend = 'google_drive' and m.processing_state = 'promoted' and m.drive_processed_file_id is not null)
      )
    order by rm.sort_order;
end;
$$;

comment on function public.get_published_story_media(uuid) is
  'Public, anon-readable. Media attached to the story''s published_revision_id ONLY (Rule 10), with valid non-revoked consent. A supabase row''s public_url (= approved_public_storage_path) and inclusion criteria are byte-for-byte unchanged from before round A review MUST-FIX 1; a google_drive row (promoted, with a derivative) is now included too, with public_url NULL and storage_backend = google_drive -- callers must use getImageUrl({id: media_id, storage_backend, public_url}) (lib/story/image-url.ts) to get /media/<id> for it, never treat a null public_url as "no image".';

revoke execute on function public.get_published_story_media(uuid) from public, anon, authenticated;
grant execute on function public.get_published_story_media(uuid) to anon, authenticated;

-- 8c-ii. list_published_stories (latest definition: 20260914092322_
-- vocab_name_zh_cn.sql). cover_image_path's own subquery/value is
-- UNTOUCHED -- still supabase-only, byte-for-byte -- so every existing
-- caller that only reads cover_image_path sees identical output for every
-- existing (supabase) story. Two new columns appended last, additive only:
-- cover_media_id/cover_storage_backend, resolved with the SAME ordering
-- (is_cover desc, sort_order asc) but across BOTH backends, so Round B's
-- getImageUrl() has what it needs for a Drive cover. Shape change ->
-- DROP+CREATE.
drop function if exists public.list_published_stories(
  timestamptz, uuid, integer, uuid, uuid, uuid, uuid, smallint, text, uuid, text, boolean, uuid, text
);

create function public.list_published_stories(
  p_cursor_published_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 20,
  p_region_id uuid default null,
  p_destination_id uuid default null,
  p_work_type_id uuid default null,
  p_tag_id uuid default null,
  p_trip_year smallint default null,
  p_travel_style text default null,
  p_contributor_id uuid default null,
  p_cost_band text default null,
  p_has_reported_expense boolean default null,
  p_exclude_story_id uuid default null,
  p_search text default null
)
returns table (
  story_id uuid,
  slug text,
  title text,
  excerpt text,
  published_at timestamptz,
  trip_year smallint,
  travel_style text,
  total_expense_nzd_cents integer,
  attribution_type public.attribution_type,
  attribution_value text,
  contributor_slug text,
  contributor_avatar_emoji text,
  cover_image_path text,
  regions jsonb,
  work_types jsonb,
  tags jsonb,
  cover_media_id uuid,
  cover_storage_backend text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_query tsquery;
begin
  if p_cost_band is not null and p_cost_band not in ('under_5k', '5k_15k', '15k_30k', '30k_plus') then
    raise exception 'Invalid cost band: %', p_cost_band;
  end if;

  if p_search is not null and length(trim(p_search)) > 0 then
    v_query := websearch_to_tsquery('simple', p_search);
  end if;

  return query
    select
      s.id, s.slug, r.title, r.excerpt, s.published_at, r.trip_year, r.travel_style,
      r.total_expense_nzd_cents, con.attribution_type,
      case when con.attribution_type = 'anonymous' then null else con.attribution_value end,
      case
        when c.public_status = 'public'
         and c.attribution_type <> 'anonymous'
         and con.attribution_type <> 'anonymous'
        then c.public_slug
        else null
      end,
      case
        when c.public_status = 'public'
         and c.attribution_type <> 'anonymous'
         and con.attribution_type <> 'anonymous'
        then c.avatar_emoji
        else null
      end,
      (
        select m.approved_public_storage_path
        from public.story_revision_media rm
        join public.story_media m on m.id = rm.media_id
        where rm.revision_id = r.id
          and m.approved_public_storage_path is not null
          and m.metadata_removed_at is not null
        order by rm.is_cover desc, rm.sort_order asc
        limit 1
      ),
      (
        select coalesce(jsonb_agg(jsonb_build_object(
          'region_name', reg.name,
          'region_name_zh_cn', reg.name_zh_cn,
          'destination_name', coalesce(dest.name, loc.custom_destination_label),
          'destination_name_zh_cn', dest.name_zh_cn
        ) order by loc.sort_order), '[]'::jsonb)
        from public.story_revision_locations loc
        join public.regions reg on reg.id = loc.region_id
        left join public.destinations dest on dest.id = loc.destination_id
        where loc.revision_id = r.id
      ),
      (
        select coalesce(jsonb_agg(coalesce(wt.name, srwt.custom_label)), '[]'::jsonb)
        from public.story_revision_work_types srwt
        left join public.work_types wt on wt.id = srwt.work_type_id
        where srwt.revision_id = r.id
      ),
      (
        select coalesce(jsonb_agg(coalesce(t.name, srt.custom_label)), '[]'::jsonb)
        from public.story_revision_tags srt
        left join public.tags t on t.id = srt.tag_id
        where srt.revision_id = r.id
      ),
      (
        select rm.media_id
        from public.story_revision_media rm
        join public.story_media m on m.id = rm.media_id
        where rm.revision_id = r.id
          and (
            (m.storage_backend = 'supabase' and m.approved_public_storage_path is not null and m.metadata_removed_at is not null)
            or (m.storage_backend = 'google_drive' and m.processing_state = 'promoted' and m.drive_processed_file_id is not null)
          )
        order by rm.is_cover desc, rm.sort_order asc
        limit 1
      ),
      (
        select m.storage_backend
        from public.story_revision_media rm
        join public.story_media m on m.id = rm.media_id
        where rm.revision_id = r.id
          and (
            (m.storage_backend = 'supabase' and m.approved_public_storage_path is not null and m.metadata_removed_at is not null)
            or (m.storage_backend = 'google_drive' and m.processing_state = 'promoted' and m.drive_processed_file_id is not null)
          )
        order by rm.is_cover desc, rm.sort_order asc
        limit 1
      )
    from public.stories s
    join public.story_revisions r
      on r.id = s.published_revision_id and r.story_id = s.id and r.revision_status = 'approved'
    join lateral (
      select * from public.story_publication_consents spc
      where spc.story_id = s.id and spc.revision_id = s.published_revision_id and spc.consent_status = 'granted'
      limit 1
    ) con on true
    left join public.contributors c on c.id = s.contributor_id
    where s.visibility = 'public'
      and s.lifecycle_status = 'published'
      and s.consent_revoked_at is null
      and (p_contributor_id is null or s.contributor_id = p_contributor_id)
      and (p_trip_year is null or r.trip_year = p_trip_year)
      and (p_travel_style is null or r.travel_style = p_travel_style)
      and (p_exclude_story_id is null or s.id <> p_exclude_story_id)
      and (v_query is null or r.search_vector @@ v_query)
      and (
        p_has_reported_expense is null
        or (p_has_reported_expense and r.total_expense_nzd_cents is not null)
        or (not p_has_reported_expense and r.total_expense_nzd_cents is null)
      )
      and (
        p_cost_band is null
        or (
          r.total_expense_nzd_cents is not null
          and (
            (p_cost_band = 'under_5k' and r.total_expense_nzd_cents < 500000)
            or (p_cost_band = '5k_15k' and r.total_expense_nzd_cents >= 500000 and r.total_expense_nzd_cents < 1500000)
            or (p_cost_band = '15k_30k' and r.total_expense_nzd_cents >= 1500000 and r.total_expense_nzd_cents < 3000000)
            or (p_cost_band = '30k_plus' and r.total_expense_nzd_cents >= 3000000)
          )
        )
      )
      and (
        p_work_type_id is null
        or exists (
          select 1 from public.story_revision_work_types wt
          where wt.revision_id = r.id and wt.work_type_id = p_work_type_id
        )
      )
      and (
        p_tag_id is null
        or exists (
          select 1 from public.story_revision_tags t
          where t.revision_id = r.id and t.tag_id = p_tag_id
        )
      )
      and (
        (p_region_id is null and p_destination_id is null)
        or exists (
          select 1 from public.story_revision_locations loc
          where loc.revision_id = r.id
            and (p_region_id is null or loc.region_id = p_region_id)
            and (p_destination_id is null or loc.destination_id = p_destination_id)
        )
      )
      and (
        p_cursor_published_at is null
        or (s.published_at, s.id) < (p_cursor_published_at, p_cursor_id)
      )
    order by s.published_at desc, s.id desc
    limit v_limit;
end;
$$;

comment on function public.list_published_stories(
  timestamptz, uuid, integer, uuid, uuid, uuid, uuid, smallint, text, uuid, text, boolean, uuid, text
) is
  'Public, anon-readable, cursor-paginated. cover_image_path is byte-for-byte unchanged for every existing (supabase) story -- still the resolved public-bucket path, still supabase-only, still ordered is_cover desc then sort_order. cover_media_id/cover_storage_backend (round A review MUST-FIX 1) are new, additive columns resolving the SAME cover across BOTH backends, so a google_drive cover is no longer silently dropped -- Round B''s call sites build /media/<id> from these via getImageUrl() rather than reading cover_image_path for a Drive cover (which stays NULL for one, exactly as before this change).';

revoke execute on function public.list_published_stories(
  timestamptz, uuid, integer, uuid, uuid, uuid, uuid, smallint, text, uuid, text, boolean, uuid, text
) from public, anon, authenticated;
grant execute on function public.list_published_stories(
  timestamptz, uuid, integer, uuid, uuid, uuid, uuid, smallint, text, uuid, text, boolean, uuid, text
) to anon, authenticated;

-- 8c-iii. get_story_for_moderator (latest definition: 20260902090200_fix_
-- consent_valid_composite_null_check.sql). No shape change (media stays
-- jsonb) -- CREATE OR REPLACE. Two logic changes only: media_processed's
-- subquery gains a google_drive branch mirroring the supabase one exactly
-- (supabase: approved_public_storage_path set; google_drive: processing_
-- state = promoted -- the Drive equivalent of "already live"), and the
-- per-media jsonb gains 'storageBackend' so the moderator review UI (and
-- the approve Server Action's orchestration, lib/story/publish-
-- orchestration.ts) can tell which media needs a bucket copy and which
-- doesn't. Every other field/value is untouched.
create or replace function public.get_story_for_moderator(p_revision_id uuid)
returns table (
  story_id uuid,
  slug text,
  story_version integer,
  lifecycle_status public.story_lifecycle_status,
  source_kind text,
  submitted_at timestamptz,
  revision_id uuid,
  revision_number integer,
  revision_status public.story_revision_status,
  revision_updated_at timestamptz,
  title text,
  excerpt text,
  content_json jsonb,
  contributor_note text,
  trip_start_date date,
  trip_end_date date,
  trip_year smallint,
  travel_style text,
  total_expense_nzd_cents integer,
  contributor_display_name text,
  contributor_public_slug text,
  consent_valid boolean,
  media_processed boolean,
  attribution_type public.attribution_type,
  attribution_value text,
  confirmation_method text,
  consent_recorded_at timestamptz,
  image_rights_confirmed_at timestamptz,
  identifiable_people_state public.identifiable_people_state,
  region_names text[],
  tag_names text[],
  media jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_story public.stories;
begin
  if not (public.has_role(auth.uid(), 'moderator') or public.has_role(auth.uid(), 'admin')) then
    raise exception 'Only a moderator or admin can read this view';
  end if;

  select s.* into v_story
  from public.stories s
  join public.story_revisions r on r.story_id = s.id
  where r.id = p_revision_id;
  if not found then
    raise exception 'No such revision: %', p_revision_id;
  end if;

  return query
    select
      v_story.id,
      v_story.slug,
      v_story.version,
      v_story.lifecycle_status,
      v_story.source_kind::text,
      v_story.submitted_at,
      r.id,
      r.revision_number,
      r.revision_status,
      r.updated_at,
      r.title,
      r.excerpt,
      r.content_json,
      r.contributor_note,
      r.trip_start_date,
      r.trip_end_date,
      r.trip_year,
      r.travel_style,
      r.total_expense_nzd_cents,
      con.display_name,
      con.public_slug,
      ((public._latest_valid_consent_for_revision(v_story.id, r.id)).id is not null),
      not exists (
        select 1 from public.story_revision_media rm
        join public.story_media m on m.id = rm.media_id
        where rm.revision_id = r.id
          and not (
            (m.storage_backend = 'supabase' and m.approved_public_storage_path is not null and m.metadata_removed_at is not null)
            or (m.storage_backend = 'google_drive' and m.processing_state = 'promoted' and m.metadata_removed_at is not null)
          )
      ),
      c.attribution_type,
      c.attribution_value,
      c.confirmation_method,
      c.publication_confirmed_at,
      c.image_rights_confirmed_at,
      c.identifiable_people_state,
      coalesce(
        (
          select array_agg(distinct rg.name order by rg.name)
          from public.story_revision_locations rl
          join public.regions rg on rg.id = rl.region_id
          where rl.revision_id = r.id
        ),
        '{}'::text[]
      ),
      coalesce(
        (
          select array_agg(nm order by nm)
          from (
            select distinct coalesce(tg.name, rt.custom_label) as nm
            from public.story_revision_tags rt
            left join public.tags tg on tg.id = rt.tag_id
            where rt.revision_id = r.id
              and coalesce(tg.name, rt.custom_label) is not null
          ) as tag_names_src
        ),
        '{}'::text[]
      ),
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'mediaId', rm.media_id,
              'sortOrder', rm.sort_order,
              'isCover', rm.is_cover,
              'altText', rm.alt_text,
              'caption', rm.caption,
              'decorative', rm.decorative,
              'processingState', m.processing_state,
              'storageBackend', m.storage_backend
            )
            order by rm.sort_order
          )
          from public.story_revision_media rm
          join public.story_media m on m.id = rm.media_id
          where rm.revision_id = r.id
        ),
        '[]'::jsonb
      )
    from public.story_revisions r
    left join public.contributors con on con.id = v_story.contributor_id
    left join lateral (
      select pc.*
      from public.story_publication_consents pc
      where pc.revision_id = r.id
      order by pc.event_number desc
      limit 1
    ) c on true
    where r.id = p_revision_id;
end;
$$;

comment on function public.get_story_for_moderator(uuid) is
  'Moderator/admin only, keyed by REVISION id. Full publishable content + review context, unchanged from 20260902090200 except: media_processed''s readiness check now has a google_drive branch (processing_state = promoted, the Drive equivalent of "approved_public_storage_path is set") alongside the untouched supabase branch; the per-media jsonb list gains storageBackend (round A review MUST-FIX 1) so callers -- in particular lib/story/publish-orchestration.ts''s approve-flow orchestration -- can tell which attached media needs a bucket-copy step and which (google_drive) does not.';

revoke execute on function public.get_story_for_moderator(uuid) from public, anon, authenticated;
grant execute on function public.get_story_for_moderator(uuid) to authenticated;
