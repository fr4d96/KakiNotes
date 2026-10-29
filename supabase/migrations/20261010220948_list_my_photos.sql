-- My Photos page (docs/google-drive-integration.md section 7, per-photo
-- downloads only -- "Download all" is a later slice). One read: every photo
-- the caller can see as a contributor, across every story status, grouped
-- by story.
--
-- "The caller's stories" is exactly list_my_stories()'s rule (and
-- _is_story_owner()'s): their own self_submitted stories, plus editorial
-- imports whose contributor is linked to them. A photo is listed when it
-- has a processed derivative (processed / promotion_pending / promoted --
-- the only states with something to show or download), isn't deleted, and
-- is attached to at least one revision of that story (an upload that was
-- never placed in any version isn't a photo anyone has seen).
--
-- No storage path or Drive file id is ever returned: thumbnails and
-- downloads are resolved server-side from the media id, after
-- authorize_story_media_preview() (Engineering Rule 2).

create or replace function public.list_my_photos()
returns table (
  media_id uuid,
  story_id uuid,
  story_title text,
  lifecycle_status text,
  story_updated_at timestamptz,
  storage_backend text,
  processed_mime_type text,
  processed_width integer,
  processed_height integer,
  processed_file_size_bytes bigint,
  alt_text text,
  caption text,
  uploaded_at timestamptz,
  in_current_version boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with my_stories as (
    select s.id,
           s.lifecycle_status,
           s.updated_at,
           coalesce(s.current_draft_revision_id, s.published_revision_id) as revision_id
    from public.stories s
    left join public.contributors c on c.id = s.contributor_id
    where (s.source_kind = 'self_submitted' and s.owner_user_id = auth.uid())
       or (s.source_kind = 'editorial_import' and c.linked_user_id = auth.uid())
  )
  select m.id,
         ms.id,
         r.title,
         ms.lifecycle_status::text,
         ms.updated_at,
         m.storage_backend,
         m.processed_mime_type,
         m.processed_width,
         m.processed_height,
         m.processed_file_size_bytes,
         cur.alt_text,
         cur.caption,
         m.created_at,
         cur.media_id is not null
  from my_stories ms
  join public.story_media m on m.story_id = ms.id
  left join public.story_revisions r on r.id = ms.revision_id
  left join public.story_revision_media cur
    on cur.revision_id = ms.revision_id and cur.media_id = m.id
  where m.deleted_at is null
    and m.processing_state in ('processed', 'promotion_pending', 'promoted')
    and exists (
      select 1 from public.story_revision_media rm where rm.media_id = m.id
    )
  -- Stories newest-edited first (as My Stories), then the photos in the
  -- order the story shows them, then any from older versions only.
  order by ms.updated_at desc, ms.id, (cur.media_id is null), cur.sort_order, m.created_at, m.id;
$$;

comment on function public.list_my_photos() is
  'My Photos page: every photo with a processed derivative on the caller''s own stories (list_my_stories()''s ownership rule), across every story status, ordered by story then display order. Returns no storage paths or Drive ids -- thumbnails and downloads are resolved server-side from media_id after authorize_story_media_preview().';

revoke execute on function public.list_my_photos() from public, anon, authenticated;
grant execute on function public.list_my_photos() to authenticated;
