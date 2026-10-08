-- Fix: the Drive proxy treated every published Drive photo as unpublished.
--
-- get_drive_media_for_proxy() (20261007063355) decides whether a signed-out
-- reader may see a Drive photo with
--   `_latest_valid_consent_for_revision(...) is not null`.
-- That function returns a whole story_publication_consents ROW, and for a
-- row value `IS NOT NULL` is only true when EVERY column is non-null -- a
-- granted consent always has some null column (e.g. its revocation fields),
-- so the check was false for every real consent. Result: /media/<id> 404'd
-- for readers on every published story, while the story page itself (which
-- uses `is null` / `not (... is null)` correctly) still pointed at it.
-- Same trap 20260930083643_fix_story_is_publicly_visible.sql fixed once
-- before.
--
-- Found by the move-to-Drive tool's end-to-end check: moving a published
-- photo is the first thing that puts one behind the proxy. Body identical
-- to the live definition (diffed against the dev database) except for
-- `not (... is null)` -- the same idiom _story_is_publicly_visible uses.

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
    and not (public._latest_valid_consent_for_revision(v_story.id, v_story.published_revision_id) is null)
  then
    v_published := true;
  end if;

  if not v_published and not public._can_access_story_media(p_media_id) then
    return;
  end if;

  return query select v_media.id, v_media.drive_processed_file_id, v_media.processed_mime_type, v_story.owner_user_id, v_published;
end;
$$;
