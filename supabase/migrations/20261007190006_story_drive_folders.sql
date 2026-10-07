-- Per-story Drive folder organisation (docs/google-drive-integration.md's
-- Drive mode, extended). Today every Drive photo lands loose in one
-- "Kakinotes" folder, named by media id. This migration adds the bookkeeping
-- table and RPCs that let lib/story/drive-folders.ts give each story its own
-- folder, named after the story's title, with photos numbered by display
-- order (01.jpg, 02.jpg, ...).
--
-- NEVER APPLIED to any database as part of this task -- file only, same as
-- the two migrations before it. Whoever applies this for real should run
-- `npm run supabase:types` / `:linked` afterwards.
--
-- Depends on 20261007063355_story_media_drive_backend.sql (storage_backend,
-- drive_processed_file_id, processed_mime_type, _is_self_submitted_story_
-- owner()) and 20261007102405_story_media_drive_upload_mode.sql. Must apply
-- after both.

-- ---------------------------------------------------------------------------
-- 1. story_drive_folders
-- ---------------------------------------------------------------------------
--
-- One row per story that has ever had a Drive folder created for it.
-- story_id is the primary key (not a separate id + unique constraint) --
-- there is at most one Drive folder per story, ever, by design (sub stories
-- get their own top-level folder, never nested, so this is a 1:1, not a
-- 1:many). owner_user_id is carried alongside for the RLS-equivalent deny-all
-- pattern and for list_my_story_drive_folder_names' own scoping -- it is NOT
-- the authorization boundary (the RPCs below re-derive ownership via
-- _is_self_submitted_story_owner on every call, never trusting this column).

create table public.story_drive_folders (
  story_id uuid primary key references public.stories (id) on delete cascade,
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  drive_folder_id text not null,
  folder_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.story_drive_folders is
  'One row per story with a Drive folder, inside the contributor''s "Kakinotes" app folder, named after the story''s title. Server-only: no client (anon or authenticated) has any direct table access -- see RLS/grants below. Read/written only via the SECURITY DEFINER RPCs in this migration, each re-deriving _is_self_submitted_story_owner(story_id) independently. Same deny-all pattern as contributor_drive_connections (20261007053505_drive_connections.sql).';

comment on column public.story_drive_folders.drive_folder_id is
  'The Drive folder id currently holding this story''s Drive-backed photos. Same folder id persists across a title-driven rename (Drive renames the folder in place) -- this column only changes if the folder is ever recreated from scratch, which ensureStoryFolder() avoids whenever a row already exists.';
comment on column public.story_drive_folders.folder_name is
  'The exact Drive folder name last written -- the sanitized, uniqueness-suffixed name derived from the story''s title (lib/story/drive-folders.ts#sanitizeStoryFolderName). Compared against the CURRENT title-implied name on every ensureStoryFolder() call to decide whether a rename is due.';

create trigger story_drive_folders_set_updated_at
  before update on public.story_drive_folders
  for each row
  execute function public.set_updated_at();

alter table public.story_drive_folders enable row level security;

-- No policies for anon/authenticated on purpose: RLS enabled with zero
-- policies denies every row to those roles by default. The explicit revoke
-- below is redundant with that default but makes the intent unmissable,
-- matching contributor_drive_connections' own convention.
revoke all on public.story_drive_folders from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. RPC: get the folder record for a story
-- ---------------------------------------------------------------------------

create or replace function public.get_story_drive_folder(p_story_id uuid)
returns table (
  drive_folder_id text,
  folder_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public._is_self_submitted_story_owner(p_story_id) then
    raise exception 'Not authorized to read the Drive folder for story %', p_story_id;
  end if;

  return query
    select f.drive_folder_id, f.folder_name
    from public.story_drive_folders f
    where f.story_id = p_story_id;
end;
$$;

comment on function public.get_story_drive_folder(uuid) is
  'Reads the caller''s own story''s Drive folder record, if any. Zero rows means no folder has been created yet. Re-derives _is_self_submitted_story_owner on every call -- never trusts an earlier check.';

revoke execute on function public.get_story_drive_folder(uuid) from public, anon, authenticated;
grant execute on function public.get_story_drive_folder(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. RPC: upsert the folder record, race-safe
-- ---------------------------------------------------------------------------
--
-- INSERT ... ON CONFLICT is atomic in Postgres -- this is what makes two
-- concurrent uploads (each independently deciding "no folder yet, create
-- one") safe: whichever insert commits first wins, and the second simply
-- updates that same row to the (identical, since both derive the same
-- title-implied name) values rather than racing to create a second Drive
-- folder. Callers in lib/story/drive-folders.ts still do their own
-- find-or-create against Drive first and then call this to record the
-- result -- this RPC only ever makes the DATABASE side race-safe, it has no
-- way to make two concurrent Drive folder-creation calls race-safe by
-- itself. ensureStoryFolder() is written to minimize that window (see its
-- own comments), not eliminate it outright -- an honest limit, not a gap
-- this RPC silently papers over.

create or replace function public.upsert_story_drive_folder(
  p_story_id uuid,
  p_drive_folder_id text,
  p_folder_name text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public._is_self_submitted_story_owner(p_story_id) then
    raise exception 'Not authorized to set the Drive folder for story %', p_story_id;
  end if;
  if p_drive_folder_id is null or length(trim(p_drive_folder_id)) = 0 then
    raise exception 'drive_folder_id is required';
  end if;
  if p_folder_name is null or length(trim(p_folder_name)) = 0 then
    raise exception 'folder_name is required';
  end if;

  insert into public.story_drive_folders (story_id, owner_user_id, drive_folder_id, folder_name)
  values (p_story_id, auth.uid(), p_drive_folder_id, p_folder_name)
  on conflict (story_id) do update
    set drive_folder_id = excluded.drive_folder_id,
        folder_name = excluded.folder_name,
        updated_at = now();
end;
$$;

comment on function public.upsert_story_drive_folder(uuid, text, text) is
  'Insert-or-update the caller''s own story''s Drive folder record. ON CONFLICT (story_id) makes the DATABASE write race-safe for two concurrent callers; it does not by itself prevent two concurrent Drive folder-creation calls -- lib/story/drive-folders.ts#ensureStoryFolder is written to narrow that window, not eliminate it.';

revoke execute on function public.upsert_story_drive_folder(uuid, text, text) from public, anon, authenticated;
grant execute on function public.upsert_story_drive_folder(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. RPC: list the caller's own story folder names, for uniqueness checks
-- ---------------------------------------------------------------------------

create or replace function public.list_my_story_drive_folder_names(p_exclude_story_id uuid default null)
returns table (
  story_id uuid,
  folder_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select f.story_id, f.folder_name
  from public.story_drive_folders f
  where f.owner_user_id = auth.uid()
    and (p_exclude_story_id is null or f.story_id <> p_exclude_story_id);
$$;

comment on function public.list_my_story_drive_folder_names(uuid) is
  'Every Drive folder name the caller currently has, across all of their own stories -- used by ensureStoryFolder() to pick a unique "Title", "Title (2)", "Title (3)", ... name. p_exclude_story_id lets a rename check uniqueness against every OTHER story of the caller''s, not against the story''s own current (about-to-change) name.';

revoke execute on function public.list_my_story_drive_folder_names(uuid) from public, anon, authenticated;
grant execute on function public.list_my_story_drive_folder_names(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. RPC: a story's Drive media, in editor display order
-- ---------------------------------------------------------------------------
--
-- "In the order the editor shows them": the current draft revision's media
-- if one exists, else the published revision's -- mirrors get_story_preview's
-- own coalesce(current_draft_revision_id, published_revision_id) precedence
-- exactly, so syncStoryFolder() numbers photos the same way the editor/
-- preview already orders them.

create or replace function public.list_story_drive_media_for_sync(p_story_id uuid)
returns table (
  media_id uuid,
  drive_processed_file_id text,
  processed_mime_type text,
  sort_order integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_story public.stories;
  v_revision_id uuid;
begin
  if not public._is_self_submitted_story_owner(p_story_id) then
    raise exception 'Not authorized to read Drive media for story %', p_story_id;
  end if;

  select * into v_story from public.stories where id = p_story_id;
  v_revision_id := coalesce(v_story.current_draft_revision_id, v_story.published_revision_id);
  if v_revision_id is null then
    return;
  end if;

  return query
    select m.id, m.drive_processed_file_id, m.processed_mime_type, rm.sort_order
    from public.story_revision_media rm
    join public.story_media m on m.id = rm.media_id
    where rm.revision_id = v_revision_id
      and m.storage_backend = 'google_drive'
      and m.drive_processed_file_id is not null
    order by rm.sort_order;
end;
$$;

comment on function public.list_story_drive_media_for_sync(uuid) is
  'The caller''s own story''s Drive-backed media, in the order the editor/preview currently shows them (current draft revision if one exists, else the published revision -- same precedence as get_story_preview). Used by lib/story/drive-folders.ts#syncStoryFolder to assign 01.ext, 02.ext, ... names.';

revoke execute on function public.list_story_drive_media_for_sync(uuid) from public, anon, authenticated;
grant execute on function public.list_story_drive_media_for_sync(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. authorize_drive_media_finalize_v2 -- a NEW function, not a DROP+CREATE
-- ---------------------------------------------------------------------------
--
-- lib/story/drive-sync.ts#finalizeDriveMediaUpload needs the reservation's
-- story_id to call ensureStoryFolder() BEFORE uploading the derivative (so
-- the derivative is written directly into the story folder, never into the
-- bare app folder and moved later).
--
-- authorize_drive_media_finalize() itself was created by this project's own
-- uncommitted slice 3 (20261007063355_story_media_drive_backend.sql) and is
-- called only by this codebase's own (also uncommitted) drive-sync.ts, so
-- reshaping its return value in place would not break any OTHER in-flight
-- branch sharing this dev database. Even so, a DROP+CREATE still means a
-- real window -- between this migration landing and the matching app code
-- deploying -- where the function's shape and the deployed code's
-- expectations disagree. A NEW function name has no such window: the old
-- authorize_drive_media_finalize(uuid) is left completely untouched (still
-- returns void, still callable, in case anything still references it), and
-- drive-sync.ts is updated to call this new function instead. The body is
-- identical to the original except for the final `return` line.

create or replace function public.authorize_drive_media_finalize_v2(p_media_id uuid)
returns uuid
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

  perform public._authorize_revision_edit(v_media.reserved_for_revision_id);

  if not public._is_self_submitted_story_owner(v_media.story_id) then
    raise exception 'Drive mode is only available to a self-submitted story''s own contributor';
  end if;

  return v_media.story_id;
end;
$$;

comment on function public.authorize_drive_media_finalize_v2(uuid) is
  'Authorize-only pre-check for lib/story/drive-sync.ts#finalizeDriveMediaUpload, called BEFORE any Drive API call for this reservation -- same checks as authorize_drive_media_finalize() (20261007063355): re-derives edit rights on the reserving revision, and checks the reservation is still a pending, unexpired, google_drive-backend row. Returns the media''s story_id on success (its only difference from authorize_drive_media_finalize(), which this project''s own code no longer calls but which is left in place rather than dropped), so the caller can call ensureStoryFolder() before uploading the derivative. Still raises (never returns a reason) on any failure.';

revoke execute on function public.authorize_drive_media_finalize_v2(uuid) from public, anon, authenticated;
grant execute on function public.authorize_drive_media_finalize_v2(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. get_story_drive_sync_state -- the one cheap post-response lookup
-- ---------------------------------------------------------------------------
--
-- save_revision_draft, reorder_story_media, set_story_cover_media and
-- detach_story_media are core editor RPCs shared with every other in-flight
-- branch against this dev database (and, in production, with the currently
-- deployed app) -- their signatures and return shapes are NOT touched by
-- this migration. Instead, the editor Server Actions call each of those
-- RPCs exactly as main does, return the response unchanged, and only AFTER
-- the response has been sent (inside next/server's after()) call this one
-- new, cheap, owner-checked RPC to decide whether a best-effort Drive sync
-- is worth even trying:
--
--   - reorder/cover/detach actions: sync only when has_drive_media is true.
--   - the title-save action: attempt a rename only when has_folder is true
--     (lib/story/drive-folders.ts#renameStoryFolderIfExists then re-reads
--     the current title and the folder's own stored name itself, and skips
--     the actual rename call if the title-implied name hasn't changed --
--     this RPC's job is only the cheap "is it worth trying at all" gate,
--     not the full comparison, so it never has to duplicate the folder-
--     naming/uniqueness logic that already lives in lib/story/drive-
--     folders.ts).
--
-- A plain supabase-backend story, or any story with no story_drive_folders
-- row and no Drive media, costs this one lightweight call (two EXISTS
-- checks against already-indexed columns) made fire-and-forget after the
-- response -- never on the request's own critical path, and never a second
-- DB write.

create or replace function public.get_story_drive_sync_state(p_story_id uuid)
returns table (
  has_drive_media boolean,
  has_folder boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_story public.stories;
  v_revision_id uuid;
  v_has_media boolean;
  v_has_folder boolean;
begin
  if not public._is_self_submitted_story_owner(p_story_id) then
    raise exception 'Not authorized to read Drive sync state for story %', p_story_id;
  end if;

  select * into v_story from public.stories where id = p_story_id;
  v_revision_id := coalesce(v_story.current_draft_revision_id, v_story.published_revision_id);

  v_has_media := v_revision_id is not null and exists (
    select 1 from public.story_revision_media rm
    join public.story_media m on m.id = rm.media_id
    where rm.revision_id = v_revision_id and m.storage_backend = 'google_drive'
  );

  v_has_folder := exists (
    select 1 from public.story_drive_folders f where f.story_id = p_story_id
  );

  return query select v_has_media, v_has_folder;
end;
$$;

comment on function public.get_story_drive_sync_state(uuid) is
  'The one cheap, owner-checked lookup the editor Server Actions call inside next/server''s after() -- never on the request''s own critical path -- to decide whether a best-effort Drive folder sync/rename is worth attempting. has_drive_media: any Drive-backed media on the story''s current draft (else published) revision. has_folder: whether a story_drive_folders row already exists. Raises for a non-self-submitted-owner caller, same as the other story_drive_folders RPCs; callers treat any error as "nothing to do" and swallow it, since this only ever runs after the response has already been sent.';

revoke execute on function public.get_story_drive_sync_state(uuid) from public, anon, authenticated;
grant execute on function public.get_story_drive_sync_state(uuid) to authenticated;
