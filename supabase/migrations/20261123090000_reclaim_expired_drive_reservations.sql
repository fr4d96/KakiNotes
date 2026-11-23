-- Expired Drive upload reservations no longer count toward the 12-photo limit.
--
-- begin_drive_media_upload counted every pending_upload row reserved for the
-- revision, whatever its age. finalize (authorize_drive_media_finalize_v2)
-- already refuses a reservation older than 30 minutes, so such a row can
-- never become a photo -- yet it held a slot forever, because the cleanup
-- sweep that was meant to reclaim it was never built. Every failed upload
-- (a dropped connection, a Drive session the browser could not reach) left
-- one behind, until a story with 7 photos was told it had 12.
--
-- Fix: under the same revision lock that already guards the count, delete
-- this revision's own google_drive reservations past the 30-minute window
-- before counting. Deleting is safe: such a row has no story_revision_media
-- join (it never left pending_upload), owns no Supabase storage object
-- (Drive rows have no private_storage_path), and its raw staging file, if
-- the browser got that far, is the abandoned-staging case drive-client.ts
-- already handles. Supabase-backed reservations are left alone: their
-- finalize has no expiry, and their storage objects are reclaimed by
-- scripts/cleanup-abandoned-media-uploads.mjs.

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
  reservation_ttl constant interval := interval '30 minutes';
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

  -- Reclaim this revision's expired Drive reservations (see header).
  delete from public.story_media
  where reserved_for_revision_id = p_revision_id
    and storage_backend = 'google_drive'
    and processing_state = 'pending_upload'
    and created_at < now() - reservation_ttl;

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
  'Drive-mode sibling of begin_story_media_upload: reserves a media slot (storage_backend = google_drive) with NO storage path. Independently re-checks for an active Drive connection server-side. Same 12-image-per-revision limit (lock then count); first deletes this revision''s own google_drive reservations older than 30 minutes, which finalize would refuse anyway, so a failed upload never holds a slot for good (20261123090000).';

revoke execute on function public.begin_drive_media_upload(uuid, text) from public, anon, authenticated;
grant execute on function public.begin_drive_media_upload(uuid, text) to authenticated;
