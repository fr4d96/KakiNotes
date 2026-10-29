-- set_story_country(): lets the story owner (or assigned editor, same
-- shape as every other authoring mutation) change an EXISTING draft's
-- country after create_self_service_draft() already picked one -- the
-- editor's new Country select on the Places step calls this before saving
-- locations, only when the country actually changed
-- (components/story/story-edit-form.tsx).
--
-- LOCKED AFTER FIRST PUBLICATION (Engineering Rule 11). stories.country_id
-- is a property of the STORY row, not the revision -- unlike title/content/
-- locations, which are revision-scoped and so a draft edit can never
-- overwrite what is publicly visible. Country has no such revision-scoped
-- shadow copy, so changing it on a story that has ever been published
-- (published_revision_id is not null, including a story currently being
-- re-edited after publication) would move ALREADY-PUBLIC content into a
-- different country's section with no moderation step in between. Refusing
-- unconditionally once published_revision_id is not null is the simplest
-- rule that cannot be bypassed by reopening a published story for editing.
--
-- Authorization is exactly _authorize_revision_edit() (20260803091100): the
-- owner (_is_story_owner, source-kind-partitioned) or the story's assigned
-- editor -- no admin bypass, same as every other draft edit -- and the
-- current draft revision must pass _revision_is_editable(). There is no
-- expected-version parameter; instead a real change bumps stories.version,
-- so any other open editor tab's next save fails as stale. The editor that
-- made the change increments its own version copy on success.
--
-- On an actual country change, deletes the current draft revision's
-- story_revision_locations whose region belongs to a DIFFERENT country --
-- story_revision_locations_validate_country() (20261014085842) would reject
-- them on the next insert/update anyway, and leaving them in place would
-- leave stale rows a contributor never asked to keep. Only ever touches the
-- CURRENT DRAFT revision -- the same one _revision_is_editable() just
-- confirmed is open for editing, never a published or historical revision.
create function public.set_story_country(p_story_id uuid, p_country_slug text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_story public.stories;
  v_draft_revision_id uuid;
  v_country_id uuid;
begin
  select * into v_story from public.stories s where s.id = p_story_id for update;
  if not found then
    raise exception 'No such story: %', p_story_id;
  end if;

  if not coalesce(
    public._is_story_owner(p_story_id)
      or v_story.assigned_editor_id = auth.uid(),
    false
  ) then
    raise exception 'Only the story owner or assigned editor can change this story''s country';
  end if;

  if v_story.published_revision_id is not null then
    raise exception 'Country can''t be changed after a story is published';
  end if;

  v_draft_revision_id := v_story.current_draft_revision_id;
  if v_draft_revision_id is null or not public._revision_is_editable(v_draft_revision_id) then
    raise exception 'Story % has no editable draft revision', p_story_id;
  end if;

  select co.id into v_country_id
  from public.countries co
  where co.slug = p_country_slug and co.active = true;
  if v_country_id is null then
    raise exception 'Unknown country: %', p_country_slug;
  end if;

  if v_country_id = v_story.country_id then
    return;
  end if;

  delete from public.story_revision_locations srl
  where srl.revision_id = v_draft_revision_id
    and srl.region_id in (
      select r.id from public.regions r where r.country_id <> v_country_id
    );

  update public.stories s
    set country_id = v_country_id, version = s.version + 1
    where s.id = p_story_id;
end;
$$;

comment on function public.set_story_country(uuid, text) is
  'Changes an existing draft story''s country. Owner or assigned editor only (same as _authorize_revision_edit). Refuses once published_revision_id is not null (country is locked after first publication -- Engineering Rule 11, since stories.country_id is not revision-scoped). Refuses an unknown/inactive country slug or a story with no editable draft revision. On an actual change, drops the current draft''s story_revision_locations whose region belongs to the old country, then bumps stories.version by 1.';

revoke execute on function public.set_story_country(uuid, text) from public, anon, authenticated;
grant execute on function public.set_story_country(uuid, text) to authenticated;
