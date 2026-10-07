-- Round B (editor uploader UI + reads). Separate migration from
-- 20261007063355_story_media_drive_backend.sql on purpose: that one is
-- already applied to the shared dev project (checksum a00fc5afd2f11470c8fdd64b2de1bf33)
-- and must not be edited after the fact. NEVER APPLIED to any database as
-- part of this task -- file only, per the task's instructions. Whoever
-- applies this for real should regenerate types/database.ts afterwards.
--
-- Two pieces:
--   1. get_story_media_upload_mode(): the server-side "which backend does
--      a NEW upload for this revision use" decision. The client
--      (components/story/image-upload-manager.tsx) only ever follows
--      this value -- it has no way to assert its own mode, since it
--      can't trustworthily check its own ownership or Drive-connection
--      status. Mirrors begin_drive_media_upload()'s own gate exactly
--      (self_submitted ownership + active connection), but returns a
--      plain value instead of raising -- a non-eligible caller (an
--      editor, an editorial-import contributor, an owner with no
--      connection, or no edit rights at all) is a completely normal case
--      here, not an error.
--   2. get_story_preview() (latest body: 20260806090100_add_sha256_to_
--      story_preview_media.sql) gains 'storageBackend' in its per-media
--      jsonb -- no RETURNS TABLE shape change, same CREATE OR REPLACE
--      pattern that migration itself used to add 'sha256'. Needed so the
--      editor's own upload panel and the owner/editor preview page can
--      render a Drive thumbnail via /media/<id> instead of trying to mint
--      a Supabase signed URL for it (which would fail outright -- a
--      google_drive row has no private_storage_path to sign).

create or replace function public.get_story_media_upload_mode(p_revision_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_story_id uuid;
begin
  select story_id into v_story_id from public.story_revisions where id = p_revision_id;
  if v_story_id is null then
    return 'supabase';
  end if;

  if not public._is_self_submitted_story_owner(v_story_id) then
    return 'supabase';
  end if;

  if exists (
    select 1 from public.contributor_drive_connections
    where user_id = auth.uid() and status = 'active'
  ) then
    return 'google_drive';
  end if;

  return 'supabase';
end;
$$;

comment on function public.get_story_media_upload_mode(uuid) is
  'The server-side decision of which backend a NEW upload for this revision should use -- google_drive only for a self_submitted story''s own owner with an active Drive connection, supabase for everyone/everything else (including a caller with no edit rights at all, who gets ''supabase'' rather than an exception -- this function never raises). The client (components/story/image-upload-manager.tsx) only ever follows this value; it has no way to assert its own mode.';

revoke execute on function public.get_story_media_upload_mode(uuid) from public, anon, authenticated;
grant execute on function public.get_story_media_upload_mode(uuid) to authenticated;

create or replace function public.get_story_preview(p_story_id uuid)
returns table (
  story_id uuid,
  title text,
  excerpt text,
  content_json jsonb,
  trip_start_date date,
  trip_end_date date,
  trip_year smallint,
  travel_style text,
  total_expense_nzd_cents integer,
  source_kind public.story_source_kind,
  lifecycle_status public.story_lifecycle_status,
  revision_id uuid,
  revision_status public.story_revision_status,
  version integer,
  attribution_type public.attribution_type,
  attribution_value text,
  viewer_relationship text,
  media jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_story public.stories;
  v_revision_id uuid;
  v_contributor public.contributors;
  v_relationship text;
begin
  select * into v_story from public.stories where id = p_story_id;
  if not found then raise exception 'No such story: %', p_story_id; end if;
  select * into v_contributor from public.contributors where id = v_story.contributor_id;

  if v_story.source_kind = 'self_submitted' then
    if v_story.owner_user_id = auth.uid() then
      v_relationship := 'owner';
    elsif v_story.assigned_editor_id = auth.uid() then
      v_relationship := 'assigned_editor';
    elsif public.has_role(auth.uid(), 'admin') then
      v_relationship := 'admin';
    else
      raise exception 'Not authorized to preview story %', p_story_id;
    end if;
  else
    if v_contributor.linked_user_id = auth.uid() then
      v_relationship := 'linked_contributor';
    elsif v_story.assigned_editor_id = auth.uid() then
      v_relationship := 'assigned_editor';
    elsif public.has_role(auth.uid(), 'admin') then
      v_relationship := 'admin';
    else
      raise exception 'Not authorized to preview story %', p_story_id;
    end if;
  end if;

  v_revision_id := coalesce(v_story.current_draft_revision_id, v_story.published_revision_id);
  if v_revision_id is null then
    raise exception 'Story % has no revision to preview', p_story_id;
  end if;

  return query
    select
      v_story.id, r.title, r.excerpt, r.content_json, r.trip_start_date, r.trip_end_date,
      r.trip_year, r.travel_style, r.total_expense_nzd_cents, v_story.source_kind,
      v_story.lifecycle_status, r.id, r.revision_status, v_story.version,
      v_contributor.attribution_type, v_contributor.display_name, v_relationship,
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
              'sha256', m.sha256,
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
    where r.id = v_revision_id;
end;
$$;

comment on function public.get_story_preview(uuid) is
  'Owner/linked-contributor (source-kind-partitioned)/assigned-editor/admin private preview. Returns no storage path of any kind for media -- only media_id, presentation fields, sha256, and (round B) storageBackend, which the caller uses to render a Drive thumbnail via /media/<id> instead of attempting to mint a Supabase signed URL for it.';

revoke execute on function public.get_story_preview(uuid) from public, anon, authenticated;
grant execute on function public.get_story_preview(uuid) to authenticated;
