-- Fix for 20260930083209_sub_stories: _story_is_publicly_visible() ended in
-- `_latest_valid_consent_for_revision(...) is not null`. For a composite,
-- IS NOT NULL is true only when EVERY field is non-null, and a consent row
-- has nullable columns, so it reported every story as not public. The
-- failure was safe (nothing extra became public; sub-story links just never
-- showed) and was caught in testing before any UI used it.
--
-- NOT (x is null) is the right test: true when the function found a row.
-- get_published_story() checks `v_consent is null` for the same reason.
create or replace function public._story_is_publicly_visible(p_story_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_story public.stories;
begin
  select st.* into v_story from public.stories st
    where st.id = p_story_id and st.visibility = 'public' and st.lifecycle_status = 'published';
  if not found or v_story.published_revision_id is null or v_story.consent_revoked_at is not null then
    return false;
  end if;

  if not exists (
    select 1 from public.story_revisions sr
    where sr.id = v_story.published_revision_id
      and sr.story_id = v_story.id
      and sr.revision_status = 'approved'
  ) then
    return false;
  end if;

  return not (public._latest_valid_consent_for_revision(v_story.id, v_story.published_revision_id) is null);
end;
$$;

revoke execute on function public._story_is_publicly_visible(uuid) from public, anon, authenticated;
