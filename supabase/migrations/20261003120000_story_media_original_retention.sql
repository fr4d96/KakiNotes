-- Retention rule for raw story-image originals (Supabase backend).
--
-- Until now the raw upload at story_media.private_storage_path (e.g.
-- `<story>/<media>/original.jpg` in story-images-private) was never deleted
-- after processStoryMedia wrote the stripped derivative to
-- processed_private_storage_path. Every raw original -- full EXIF, GPS
-- included -- sat in the private bucket indefinitely. Nothing needs it once
-- processing has succeeded:
--
--   - Preview, the photo viewer, the PDF export and publication all read
--     processed_private_storage_path (get_media_private_path_for_preview,
--     copyStoryMediaToPublic), never the raw original.
--   - The only reader of the raw original is processStoryMedia itself, and
--     record_processed_story_media only accepts 'uploaded' or 'failed'. The
--     transition trigger (story_media_validate_processing_state_transition)
--     never lets a row go back from processed/promotion_pending/promoted to
--     either, so a successfully processed raw can never be read again.
--
-- The rule (one place: _story_media_original_is_due below):
--
--   - processed / promotion_pending / promoted -> due immediately. The
--     pipeline deletes it inline right after a successful record; the
--     maintenance sweep (scripts/purge-media-originals.mjs) catches anything
--     the inline delete missed, plus the pre-existing backlog.
--   - failed -> due 30 days after upload. A failed row has no derivative
--     (story_media_processed_fields_require_processed_or_later forces those
--     columns null), so the raw is the only thing a repair can work from --
--     scripts/reprocess-failed-story-media.mjs exists because exactly that
--     rescued 12 photos after the 2026-08-23 byte-corruption bug. 30 days
--     keeps that window open; after it, reprocessing fails clearly with
--     error_code 'original_deleted' and the contributor re-uploads.
--   - pending_upload / uploaded / processing -> never due. pending_upload is
--     owned by scripts/cleanup-abandoned-media-uploads.mjs; the other two
--     are mid-flight and still need the raw.
--
-- Storage objects are only ever deleted through the Storage API (never a raw
-- `delete from storage.objects`), matching the existing maintenance script.
-- Order is always: delete the object, THEN mark_story_media_original_deleted.
-- If the mark fails, the row stays due and the next sweep retries; removing
-- an already-missing object is a no-op, so the pair converges. The opposite
-- order could leave a row claiming "deleted" while the GPS-bearing file is
-- still there.
--
-- No storage policy changes. "private media: authorized read" still matches
-- on private_storage_path; once the object is gone there is nothing for it to
-- match, and the reserved-path INSERT policy only admits pending_upload rows,
-- so a deleted original can never be re-written into its old path.
--
-- private_storage_path itself stays NOT NULL and keeps its value as a record
-- of where the raw used to live. docs/google-drive-integration.md's planned
-- backend migration makes that column nullable for google_drive rows; that
-- change is independent of this one.

alter table public.story_media
  add column original_deleted_at timestamptz;

comment on column public.story_media.original_deleted_at is
  'When the raw original at private_storage_path was deleted from story-images-private. Null = the raw object may still exist. Set only by mark_story_media_original_deleted(), after the Storage API delete has succeeded. Once set, the media can never be (re)processed again.';

-- A raw original can only be gone once its row has left the states that
-- still read it. 'processing' is allowed because record_story_media_
-- processing_failed passes a failed row through 'processing' on its way back
-- to 'failed' (CHECK constraints are evaluated per statement), and that is
-- exactly the path that records the 'original_deleted' failure.
alter table public.story_media
  add constraint story_media_original_deleted_requires_settled_state check (
    original_deleted_at is null
    or processing_state not in ('pending_upload', 'uploaded')
  );

-- Keeps the sweep's candidate query cheap: only rows whose raw may still
-- exist are ever scanned.
create index story_media_original_retained_idx
  on public.story_media (created_at)
  where original_deleted_at is null;

create or replace function public._story_media_original_is_due(
  p_processing_state public.story_media_processing_state,
  p_created_at timestamptz
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_processing_state in ('processed', 'promotion_pending', 'promoted')
    or (p_processing_state = 'failed' and p_created_at < now() - interval '30 days');
$$;

comment on function public._story_media_original_is_due(public.story_media_processing_state, timestamptz) is
  'The single retention rule for raw originals: due as soon as processing has succeeded; due 30 days after upload for a failed row (kept that long so a pipeline bug can still be repaired from it). Internal helper, no API grants.';

revoke execute on function public._story_media_original_is_due(public.story_media_processing_state, timestamptz)
  from public, anon, authenticated;

create or replace function public.list_story_media_originals_due_for_deletion(p_limit integer default 100)
returns table (media_id uuid, private_storage_path text, processing_state public.story_media_processing_state)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.private_storage_path, m.processing_state
  from public.story_media m
  where m.original_deleted_at is null
    and public._story_media_original_is_due(m.processing_state, m.created_at)
    -- Paranoia: never hand back a path that is also the derivative's. The
    -- naming conventions (original.<ext> vs processed-<sha256>.<ext>) make
    -- this impossible today; this keeps it impossible if either changes.
    and m.private_storage_path is distinct from m.processed_private_storage_path
  order by m.created_at
  limit greatest(1, least(coalesce(p_limit, 100), 1000));
$$;

comment on function public.list_story_media_originals_due_for_deletion(integer) is
  'Candidates for the raw-original retention sweep (scripts/purge-media-originals.mjs): rows whose raw original may still exist and is past retention. Returns a private storage path, so service_role only -- never granted to any client role.';

revoke execute on function public.list_story_media_originals_due_for_deletion(integer)
  from public, anon, authenticated;
grant execute on function public.list_story_media_originals_due_for_deletion(integer) to service_role;

create or replace function public.mark_story_media_original_deleted(p_media_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_media public.story_media;
begin
  select * into v_media from public.story_media where id = p_media_id for update;
  if not found then
    raise exception 'No such media: %', p_media_id;
  end if;
  if v_media.original_deleted_at is not null then
    return; -- idempotent: already recorded
  end if;
  if not public._story_media_original_is_due(v_media.processing_state, v_media.created_at) then
    raise exception 'Original for media % is not due for deletion (state %)', p_media_id, v_media.processing_state;
  end if;

  update public.story_media set original_deleted_at = now() where id = p_media_id;
end;
$$;

comment on function public.mark_story_media_original_deleted(uuid) is
  'Records that the raw original has been deleted via the Storage API. Call only AFTER the delete succeeded. Re-checks the retention rule and refuses a row that is not due. Idempotent. service_role only.';

revoke execute on function public.mark_story_media_original_deleted(uuid) from public, anon, authenticated;
grant execute on function public.mark_story_media_original_deleted(uuid) to service_role;
