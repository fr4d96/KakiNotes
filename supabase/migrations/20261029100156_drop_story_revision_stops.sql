-- Drop the per-revision journey stops (20261029042052_story_revision_stops),
-- replaced by the contributor journey (20261029091942_contributor_journey).
--
-- CONTRACT step: apply only AFTER the app release that no longer calls
-- set_revision_stops / get_revision_stops / get_published_story_stops is
-- deployed, or the live story editor's journey section starts failing.
--
-- The table's rows are deleted with it. On 2026-10-29 it held 3 rows, all on
-- an unpublished draft (test labels), never shown to a reader.
--
-- --------------------------------------------------------------------------
-- The two CHILD-TABLE CHECKLIST sites come
-- first: their bodies are 20261029042052's (= the live definitions), with
-- only the story_revision_stops lines taken out.
-- --------------------------------------------------------------------------
create or replace function public.create_next_draft_revision(p_story_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_story public.stories;
  v_candidate record;
  v_published_number integer;
  v_source_revision_id uuid;
  v_new_revision_id uuid;
  v_next_number integer;
  v_content_text text;
  v_stripped text;
  v_embedded_id text;
begin
  select * into v_story from public.stories where id = p_story_id for update;
  if not found then
    raise exception 'No such story: %', p_story_id;
  end if;
  if not coalesce(public._is_story_owner(p_story_id) or v_story.assigned_editor_id = auth.uid(), false) then
    raise exception 'Only the story owner or assigned editor can start a new draft revision';
  end if;
  if v_story.current_draft_revision_id is not null then
    raise exception 'Story % already has an active draft/replacement revision', p_story_id;
  end if;
  if v_story.lifecycle_status = 'archived' then
    raise exception 'Cannot create a new revision for an archived story';
  end if;

  select id, revision_number into v_candidate
  from public.story_revisions
  where story_id = p_story_id and revision_status in ('rejected', 'changes_requested', 'withdrawn')
  order by revision_number desc limit 1;

  if v_story.published_revision_id is null then
    if v_candidate.id is null then
      raise exception 'Story % has no prior terminal revision to base a new draft on', p_story_id;
    end if;
    v_source_revision_id := v_candidate.id;
  else
    select revision_number into v_published_number
    from public.story_revisions where id = v_story.published_revision_id;
    if v_candidate.id is not null and v_candidate.revision_number > v_published_number then
      v_source_revision_id := v_candidate.id;
    else
      v_source_revision_id := v_story.published_revision_id;
    end if;
  end if;

  select coalesce(max(revision_number), 0) + 1 into v_next_number
  from public.story_revisions where story_id = p_story_id;

  insert into public.story_revisions (
    story_id, revision_number, title, excerpt, content_json, trip_start_date, trip_end_date,
    trip_year, travel_style, total_expense_nzd_cents, contributor_note,
    created_by, updated_by
  )
  select
    p_story_id, v_next_number, title, excerpt, content_json, trip_start_date, trip_end_date,
    trip_year, travel_style, total_expense_nzd_cents, contributor_note,
    auth.uid(), auth.uid()
  from public.story_revisions where id = v_source_revision_id
  returning id into v_new_revision_id;

  -- Fix 1: the new revision becomes the story's active draft BEFORE its
  -- child rows are copied, so _protect_revision_child_immutability() sees an
  -- editable revision (which it is) rather than an orphan.
  update public.stories set current_draft_revision_id = v_new_revision_id, version = version + 1
    where id = p_story_id;

  -- CHILD-TABLE CHECKLIST. A new draft must be a true copy of what is
  -- published, not a quietly lossy one. Every table keyed off revision_id
  -- has to be copied below, with EVERY contributor-authored column, or the
  -- contributor loses that data the moment they click Edit:
  --   story_revision_locations  (region_id, destination_id,
  --                              custom_destination_label, sort_order)
  --   story_revision_work_types (work_type_id, custom_label)
  --   story_revision_tags       (tag_id, custom_label)
  --   story_revision_media      (media_id, alt_text, caption, decorative,
  --                              sort_order, is_cover)
  --   story_revision_expenses   (category_id, custom_label, amount_nzd_cents, note)
  -- If you add a table to that list, add it here in the same change. Two
  -- migrations (20260902100000, and this one) exist only because that did
  -- not happen. All of these must come AFTER the draft-pointer update
  -- above, or _protect_revision_child_immutability() rejects every row.
  -- custom_destination_label too (20260903140000). Dropping it here would
  -- silently lose a contributor-typed place the moment they edit a
  -- published story -- no constraint would catch it, because a row with
  -- neither destination_id nor a label is a valid region-only location.
  -- custom_region_label as well, WHERE THE COLUMN EXISTS. The hosted
  -- database already has it (20261015063409_custom_region_labels, applied
  -- from a branch not yet merged to main), and its live version of this
  -- function copies it; dropping it would make editing a published story
  -- with a typed region fail story_revision_locations_region_one_of. A
  -- database built from main alone has no such column yet, so the copy is
  -- dynamic there instead of failing to run.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'story_revision_locations'
      and column_name = 'custom_region_label'
  ) then
    execute
      'insert into public.story_revision_locations
         (revision_id, region_id, custom_region_label, destination_id, custom_destination_label, sort_order)
       select $1, region_id, custom_region_label, destination_id, custom_destination_label, sort_order
       from public.story_revision_locations where revision_id = $2'
      using v_new_revision_id, v_source_revision_id;
  else
    insert into public.story_revision_locations
      (revision_id, region_id, destination_id, custom_destination_label, sort_order)
    select v_new_revision_id, region_id, destination_id, custom_destination_label, sort_order
    from public.story_revision_locations where revision_id = v_source_revision_id;
  end if;

  -- custom_label, not just work_type_id -- see this migration's header.
  insert into public.story_revision_work_types (revision_id, work_type_id, custom_label)
  select v_new_revision_id, work_type_id, custom_label
  from public.story_revision_work_types where revision_id = v_source_revision_id;

  insert into public.story_revision_tags (revision_id, tag_id, custom_label)
  select v_new_revision_id, tag_id, custom_label
  from public.story_revision_tags where revision_id = v_source_revision_id;

  insert into public.story_revision_media (revision_id, media_id, alt_text, caption, decorative, sort_order, is_cover)
  select v_new_revision_id, media_id, alt_text, caption, decorative, sort_order, is_cover
  from public.story_revision_media where revision_id = v_source_revision_id;

  -- custom_label as well as category_id (20260903110000) -- an expense row
  -- is now EITHER a curated reference or a contributor-typed label, and
  -- copying only the id column would violate
  -- story_revision_expenses_one_of and make "edit a published story" fail
  -- outright. This is the fourth time this checklist has been the fix.
  insert into public.story_revision_expenses
    (revision_id, category_id, custom_label, amount_nzd_cents, note)
  select v_new_revision_id, category_id, custom_label, amount_nzd_cents, note
  from public.story_revision_expenses where revision_id = v_source_revision_id;

  -- Fix 2: drop any embed token in the copied content whose image did not
  -- come with it, so the new draft satisfies save_revision_draft's
  -- reference-integrity check from its very first autosave.
  select content_json->0->>'text' into v_content_text
  from public.story_revisions where id = v_new_revision_id;

  if v_content_text is not null then
    v_stripped := v_content_text;
    for v_embedded_id in
      select distinct lower(m[1])
      from regexp_matches(
        v_content_text,
        '!\[\[([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})(\|[0-9]{2,4})?\]\]',
        'g'
      ) as m
    loop
      if not exists (
        select 1 from public.story_revision_media
        where revision_id = v_new_revision_id and media_id::text = v_embedded_id
      ) then
        v_stripped := regexp_replace(
          v_stripped,
          '!\[\[' || v_embedded_id || '(\|[0-9]{2,4})?\]\]',
          '',
          'gi'
        );
      end if;
    end loop;

    if v_stripped <> v_content_text then
      update public.story_revisions
      set content_json = jsonb_set(content_json, '{0,text}', to_jsonb(v_stripped))
      where id = v_new_revision_id;
    end if;
  end if;

  if v_story.lifecycle_status in ('rejected', 'changes_requested', 'draft') then
    update public.stories set lifecycle_status = 'draft' where id = p_story_id;
  end if;

  return v_new_revision_id;
end;
$$;
comment on function public.create_next_draft_revision(uuid) is
  'Starts the story''s next draft from its published (or latest terminal) revision. Copies EVERY per-revision child table -- locations, work types, tags, media and expenses -- including contributor-authored columns; the function body carries the checklist. Sets the draft pointer BEFORE copying child rows, or _protect_revision_child_immutability() rejects every copy; and strips embed tokens whose image was not carried over.';
revoke execute on function public.create_next_draft_revision(uuid) from public, anon, authenticated;
grant execute on function public.create_next_draft_revision(uuid) to authenticated;

create or replace function public.delete_draft_story(
  p_story_id uuid, p_expected_version integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_story public.stories;
  v_revision_count integer;
  v_revision public.story_revisions;
begin
  select * into v_story from public.stories where id = p_story_id for update;
  if not found then
    raise exception 'No such story: %', p_story_id;
  end if;
  if not public._is_story_owner(p_story_id) then
    raise exception 'Only the story owner can delete this story';
  end if;
  if v_story.version <> p_expected_version then
    raise exception 'Stale version for story % (expected %, got %)', p_story_id, v_story.version, p_expected_version;
  end if;

  if v_story.lifecycle_status not in ('draft', 'private') or v_story.published_revision_id is not null then
    raise exception 'Only a never-published draft or private story can be deleted (story %)', p_story_id;
  end if;
  if v_story.current_draft_revision_id is null then
    raise exception 'Story % has no draft revision to delete', p_story_id;
  end if;

  select * into v_revision from public.story_revisions
    where id = v_story.current_draft_revision_id for update;
  if v_revision.revision_status <> 'draft' then
    raise exception 'Story % is not currently in a plain-draft state', p_story_id;
  end if;

  select count(*) into v_revision_count
  from public.story_revisions where story_id = p_story_id;
  if v_revision_count <> 1 then
    raise exception
      'Story % has prior reviewed revision history and cannot be deleted this way', p_story_id;
  end if;

  -- CHILD-TABLE CHECKLIST (site 2 of 2 -- the other is
  -- create_next_draft_revision, which COPIES the same list). Every table
  -- keyed off revision_id has `on delete restrict`, so each one must be
  -- cleared here before the story_revisions delete below or that delete
  -- raises and the whole deletion silently rolls back:
  --   story_revision_media
  --   story_media            (keyed off story_id, not revision_id)
  --   story_revision_locations
  --   story_revision_work_types
  --   story_revision_tags
  --   story_revision_expenses
  -- Adding a per-revision table means editing BOTH sites in the same
  -- change. Three migrations now exist only because that did not happen.
  delete from public.story_revision_media where revision_id = v_revision.id;
  delete from public.story_media where story_id = p_story_id;
  delete from public.story_revision_locations where revision_id = v_revision.id;
  delete from public.story_revision_work_types where revision_id = v_revision.id;
  delete from public.story_revision_tags where revision_id = v_revision.id;
  delete from public.story_revision_expenses where revision_id = v_revision.id;

  update public.stories set current_draft_revision_id = null where id = p_story_id;
  delete from public.story_revisions where id = v_revision.id;
  delete from public.stories where id = p_story_id;
end;
$$;

comment on function public.delete_draft_story(uuid, integer) is
  'Hard-deletes a never-published draft OR private story and every per-revision child row it owns. The function body carries the child-table checklist; it is one of TWO sites that enumerate those tables (create_next_draft_revision copies the same list), and both must be updated together when a new one is added -- every child FK is `on delete restrict`, so a missed table makes this fail and roll back silently rather than loudly.';

revoke execute on function public.delete_draft_story(uuid, integer) from public, anon, authenticated;
grant execute on function public.delete_draft_story(uuid, integer) to authenticated;

drop function public.get_published_story_stops(text);
drop function public.get_revision_stops(uuid);
drop function public.set_revision_stops(uuid, integer, jsonb);
drop table public.story_revision_stops;
