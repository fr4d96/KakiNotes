-- Full-quality copies for Drive-connected contributors (owner decision
-- 2026-10-11, "option B"). Every NEW photo a Drive-connected contributor
-- uploads gets two cleaned copies in their own Drive: the display copy (as
-- before: long edge <= 2000px, what readers see) and a full-resolution copy
-- in a "Full quality" subfolder of the story's folder. Both have their
-- EXIF/GPS stripped. The full copy is NEVER public and never served to a
-- reader, editor or moderator: only the photo's own contributor can
-- download it, from My Photos. Photos stored on Kakinotes stay display-only.
--
-- Engineering Rules 13/14 unchanged in substance: the display copy is still
-- the one derivative written for public use; the full copy is a second
-- stripped derivative, owner-only, and the raw upload is still deleted
-- after processing.

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------

alter table public.story_media
  add column drive_full_file_id text,
  add column drive_full_folder_id text,
  add column full_mime_type text,
  add column full_width integer,
  add column full_height integer,
  add column full_file_size_bytes bigint;

comment on column public.story_media.drive_full_file_id is
  'Drive id of the full-resolution, metadata-stripped copy (owner-only, never public). Only ever set on a google_drive row that already has its display copy (drive_processed_file_id). Null for every Kakinotes-stored photo and for Drive photos uploaded before full copies existed.';

alter table public.story_media
  add constraint story_media_full_copy_all_or_nothing check (
    (drive_full_file_id is null
      and drive_full_folder_id is null
      and full_mime_type is null
      and full_width is null
      and full_height is null
      and full_file_size_bytes is null)
    or
    (drive_full_file_id is not null
      and drive_full_folder_id is not null
      and full_mime_type in ('image/jpeg', 'image/png')
      and full_width > 0
      and full_height > 0
      and full_file_size_bytes > 0
      and storage_backend = 'google_drive'
      and drive_processed_file_id is not null)
  );

-- ---------------------------------------------------------------------------
-- 2. Record a full copy (the uploading contributor, once per photo)
-- ---------------------------------------------------------------------------

create or replace function public.record_drive_media_full_copy(
  p_media_id uuid,
  p_drive_full_file_id text,
  p_drive_full_folder_id text,
  p_full_mime_type text,
  p_full_width integer,
  p_full_height integer,
  p_full_file_size_bytes bigint
)
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
  if not public._is_self_submitted_story_owner(v_media.story_id) then
    raise exception 'Not authorized to record a full copy for media %', p_media_id;
  end if;
  if v_media.storage_backend <> 'google_drive' or v_media.drive_processed_file_id is null then
    raise exception 'Media % has no Drive display copy', p_media_id;
  end if;
  if v_media.drive_full_file_id is not null then
    raise exception 'Media % already has a full copy', p_media_id;
  end if;

  update public.story_media
    set drive_full_file_id = p_drive_full_file_id,
        drive_full_folder_id = p_drive_full_folder_id,
        full_mime_type = p_full_mime_type,
        full_width = p_full_width,
        full_height = p_full_height,
        full_file_size_bytes = p_full_file_size_bytes
    where id = p_media_id;
end;
$$;

comment on function public.record_drive_media_full_copy(uuid, text, text, text, integer, integer, bigint) is
  'Records the full-quality copy lib/story/drive-sync.ts wrote to the contributor''s Drive after a Drive upload. Only the story''s own self-submitted owner, only on a Drive row that has its display copy, only once.';

revoke execute on function public.record_drive_media_full_copy(uuid, text, text, text, integer, integer, bigint) from public, anon, authenticated;
grant execute on function public.record_drive_media_full_copy(uuid, text, text, text, integer, integer, bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Folder sync: the story's full copies, in display order
-- ---------------------------------------------------------------------------

create or replace function public.list_story_drive_full_copies_for_sync(p_story_id uuid)
returns table (
  media_id uuid,
  drive_full_file_id text,
  full_mime_type text,
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

  -- Same rows and order as list_story_drive_media_for_sync(), so the full
  -- copy of 03.jpg is Full quality/03.jpg.
  return query
    select m.id, m.drive_full_file_id, m.full_mime_type, rm.sort_order
    from public.story_revision_media rm
    join public.story_media m on m.id = rm.media_id
    where rm.revision_id = v_revision_id
      and m.storage_backend = 'google_drive'
      and m.drive_processed_file_id is not null
    order by rm.sort_order;
end;
$$;

comment on function public.list_story_drive_full_copies_for_sync(uuid) is
  'The caller''s own story''s Drive photos in display order, with each one''s full-quality file id (null when it has none) -- the same rows as list_story_drive_media_for_sync(), so lib/story/drive-folders.ts can number Full quality/NN.ext to match NN.ext.';

revoke execute on function public.list_story_drive_full_copies_for_sync(uuid) from public, anon, authenticated;
grant execute on function public.list_story_drive_full_copies_for_sync(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Owner-only download lookup (the proxy's ?full=1)
-- ---------------------------------------------------------------------------
--
-- Deliberately NOT get_drive_media_for_proxy(): that one also answers for
-- published photos (anyone) and for staff previews. The full copy is the
-- owner's alone, so this answers only for the story's own self-submitted
-- owner -- the only person whose Drive can hold it.

create or replace function public.get_drive_full_copy_for_owner(p_media_id uuid)
returns table (
  drive_full_file_id text,
  full_mime_type text,
  owner_user_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.drive_full_file_id, m.full_mime_type, s.owner_user_id
  from public.story_media m
  join public.stories s on s.id = m.story_id
  where m.id = p_media_id
    and m.deleted_at is null
    and m.drive_full_file_id is not null
    and s.source_kind = 'self_submitted'
    and s.owner_user_id = auth.uid();
$$;

comment on function public.get_drive_full_copy_for_owner(uuid) is
  'The full-quality copy of a photo, for its own contributor only (zero rows for anyone else, for a photo with no full copy, or a deleted one). Used by app/media/[mediaId]/route.ts?full=1.';

revoke execute on function public.get_drive_full_copy_for_owner(uuid) from public, anon, authenticated;
grant execute on function public.get_drive_full_copy_for_owner(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. My Photos: say which photos have a full copy
-- ---------------------------------------------------------------------------
--
-- Adding a column changes the return type, so drop and recreate. One
-- transaction: there is no moment without the function. Body unchanged
-- apart from has_full_copy.

drop function public.list_my_photos();

create function public.list_my_photos()
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
  in_current_version boolean,
  has_full_copy boolean
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
         cur.media_id is not null,
         m.drive_full_file_id is not null
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
  order by ms.updated_at desc, ms.id, (cur.media_id is null), cur.sort_order, m.created_at, m.id;
$$;

comment on function public.list_my_photos() is
  'My Photos page: every photo with a processed derivative on the caller''s own stories (list_my_stories()''s ownership rule), across every story status, ordered by story then display order. has_full_copy: a full-quality copy exists in the contributor''s Drive. Returns no storage paths or Drive ids.';

revoke execute on function public.list_my_photos() from public, anon, authenticated;
grant execute on function public.list_my_photos() to authenticated;
