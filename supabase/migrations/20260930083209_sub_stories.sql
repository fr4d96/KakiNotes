-- Sub stories: a story can be linked under a "main story".
--
--   Food in Queenstown        (main story)
--     └─ Fergburger           (sub story)
--
-- WHERE THE LINK LIVES. On story_revisions, not on stories. The link is
-- part of what a reader sees ("Part of: Food in Queenstown" on the sub
-- story, a list of sub stories on the main one), so it has to go through
-- moderation like every other piece of story content. A column on stories
-- would go public the moment it was set, which is exactly what Engineering
-- Rule 11 forbids. On a revision it rides the normal flow: set on the
-- draft, frozen on submit, public only once that revision is approved and
-- published.
--
-- RULES (enforced in set_revision_parent_story, the only writer):
--   * the main story belongs to the SAME contributor -- nobody can hang
--     their story under someone else's;
--   * the main story has a published revision -- which also means it can
--     never be hard-deleted by delete_draft_story(), so the `on delete
--     restrict` FK below can never block that function;
--   * two levels only: the main story must not itself be a sub story, and
--     a story that already has sub stories cannot become one;
--   * not itself.
-- The two-level check reads current state and can race (two tabs linking
-- in opposite directions at once). Public reads never follow more than one
-- hop, so the worst outcome of that race is a story that shows both a
-- "Part of" line and a sub-story list -- odd, not a leak.
--
-- PUBLIC READS go through get_published_story_family(), which applies the
-- same visibility test as get_published_story() to BOTH ends of every
-- link: a sub story whose main story is archived, taken down or had its
-- consent revoked simply shows no "Part of" line, and a main story never
-- lists a sub story that is not itself publicly visible (Rules 10, 12).

alter table public.story_revisions
  add column parent_story_id uuid references public.stories (id) on delete restrict;

comment on column public.story_revisions.parent_story_id is
  'The main story this revision files the story under, or null for a standalone/main story. Written only by set_revision_parent_story(); copied by create_next_draft_revision(); frozen with the rest of the content once the revision leaves draft. Public reads follow it only from a published revision, and only to a publicly visible story (get_published_story_family()).';

create index story_revisions_parent_story_id_idx
  on public.story_revisions (parent_story_id)
  where parent_story_id is not null;

-- --------------------------------------------------------------------------
-- Freeze the link with the rest of the content. Body is the original
-- (20260803090200_story_revisions.sql, never redefined since) plus one line.
-- --------------------------------------------------------------------------
create or replace function public.story_revisions_protect_immutable_content()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.revision_status <> 'draft' then
    if new.title is distinct from old.title
      or new.excerpt is distinct from old.excerpt
      or new.content_json is distinct from old.content_json
      or new.trip_start_date is distinct from old.trip_start_date
      or new.trip_end_date is distinct from old.trip_end_date
      or new.trip_year is distinct from old.trip_year
      or new.travel_style is distinct from old.travel_style
      or new.total_expense_nzd_cents is distinct from old.total_expense_nzd_cents
      or new.contributor_note is distinct from old.contributor_note
      or new.parent_story_id is distinct from old.parent_story_id
    then
      raise exception 'Revision content is immutable once it leaves draft status (revision %)', old.id;
    end if;
  end if;
  return new;
end;
$$;

-- --------------------------------------------------------------------------
-- _story_is_publicly_visible(): the exact gate get_published_story() applies
-- before returning anything, as a boolean. Internal; no API grant.
-- --------------------------------------------------------------------------
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

  return public._latest_valid_consent_for_revision(v_story.id, v_story.published_revision_id) is not null;
end;
$$;
comment on function public._story_is_publicly_visible(uuid) is
  'Internal: true only when get_published_story() would return this story -- public visibility, published lifecycle, an approved published revision, no revoked consent, and a valid consent row. Keep the two in step. No API grants.';

revoke execute on function public._story_is_publicly_visible(uuid) from public, anon, authenticated;

-- --------------------------------------------------------------------------
-- _story_has_sub_stories(): does any story's in-flight or published revision
-- name this story as its main story? Internal; no API grant.
-- --------------------------------------------------------------------------
create or replace function public._story_has_sub_stories(p_story_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.stories child
    join public.story_revisions r
      on r.id in (child.current_draft_revision_id, child.published_revision_id)
    where r.parent_story_id = p_story_id
      and child.id <> p_story_id
  );
$$;
revoke execute on function public._story_has_sub_stories(uuid) from public, anon, authenticated;

-- --------------------------------------------------------------------------
-- set_revision_parent_story(): the only writer. Null clears the link.
-- --------------------------------------------------------------------------
create or replace function public.set_revision_parent_story(
  p_revision_id uuid, p_expected_version integer, p_parent_story_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_story_id uuid;
  v_story public.stories;
  v_parent public.stories;
  v_parent_parent uuid;
begin
  -- Owner or assigned editor, revision still an editable draft; locks the story.
  select public._authorize_revision_edit(p_revision_id) into v_story_id;
  select * into v_story from public.stories where id = v_story_id;
  if v_story.version <> p_expected_version then
    raise exception 'Stale version for story % (expected %, got %)', v_story_id, v_story.version, p_expected_version;
  end if;

  if p_parent_story_id is not null then
    if p_parent_story_id = v_story_id then
      raise exception 'A story cannot be its own main story' using errcode = 'WHV10';
    end if;

    select * into v_parent from public.stories where id = p_parent_story_id;
    -- One message for "no such story" and "not yours", so this cannot be
    -- used to probe for other contributors' story ids.
    if not found or v_parent.contributor_id <> v_story.contributor_id then
      raise exception 'Main story not found' using errcode = 'WHV11';
    end if;
    if v_parent.published_revision_id is null or v_parent.lifecycle_status <> 'published' then
      raise exception 'The main story must be published first' using errcode = 'WHV12';
    end if;

    select parent_story_id into v_parent_parent
    from public.story_revisions where id = v_parent.published_revision_id;
    if v_parent_parent is not null then
      raise exception 'That story is itself a sub story' using errcode = 'WHV13';
    end if;

    if public._story_has_sub_stories(v_story_id) then
      raise exception 'This story already has sub stories, so it cannot become one' using errcode = 'WHV14';
    end if;
  end if;

  update public.story_revisions
    set parent_story_id = p_parent_story_id, updated_by = auth.uid(), updated_at = now()
    where id = p_revision_id;

  update public.stories set version = version + 1 where id = v_story_id;
end;
$$;
comment on function public.set_revision_parent_story(uuid, integer, uuid) is
  'Files a draft revision under a main story, or clears that with null. Same edit-rights rule and optimistic-version check as every other authoring RPC. The main story must belong to the same contributor, be published, not itself be a sub story; and this story must not already have sub stories (two levels only). WHV10-WHV14 name each refusal.';

revoke execute on function public.set_revision_parent_story(uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.set_revision_parent_story(uuid, integer, uuid) to authenticated;

-- --------------------------------------------------------------------------
-- get_revision_parent_story(): what the editor, preview and moderation
-- screens show. Always exactly one row.
-- --------------------------------------------------------------------------
create or replace function public.get_revision_parent_story(p_revision_id uuid)
returns table (
  parent_story_id uuid,
  parent_title text,
  parent_slug text,
  has_sub_stories boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_story_id uuid;
  v_parent_story_id uuid;
begin
  select story_id, sr.parent_story_id into v_story_id, v_parent_story_id
  from public.story_revisions sr where sr.id = p_revision_id;
  if v_story_id is null then
    raise exception 'No such revision: %', p_revision_id;
  end if;

  if not coalesce(
    public._is_story_owner(v_story_id)
    or exists (
      select 1 from public.stories s
      where s.id = v_story_id and s.assigned_editor_id = auth.uid()
    )
    or public.has_role(auth.uid(), 'moderator')
    or public.has_role(auth.uid(), 'admin'),
    false
  ) then
    raise exception 'Not authorized to read revision %', p_revision_id;
  end if;

  return query
    select
      p.id,
      -- The main story's published title: it is the only title a reader of
      -- the sub story would ever see next to it.
      pr.title,
      p.slug,
      public._story_has_sub_stories(v_story_id)
    from (select 1) one
    left join public.stories p on p.id = v_parent_story_id
    left join public.story_revisions pr on pr.id = p.published_revision_id;
end;
$$;
comment on function public.get_revision_parent_story(uuid) is
  'Owner, assigned editor, moderator or admin: the main story a revision is filed under (id, published title, slug -- all null when none) and whether this story already has sub stories (in which case it cannot become one).';

revoke execute on function public.get_revision_parent_story(uuid) from public, anon, authenticated;
grant execute on function public.get_revision_parent_story(uuid) to authenticated;

-- --------------------------------------------------------------------------
-- list_parent_story_options(): the contributor's own stories that could be
-- picked as this story's main story.
-- --------------------------------------------------------------------------
create or replace function public.list_parent_story_options(p_story_id uuid)
returns table (
  story_id uuid,
  title text,
  slug text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_story public.stories;
begin
  select * into v_story from public.stories where id = p_story_id;
  if not found then
    raise exception 'No such story: %', p_story_id;
  end if;
  if not coalesce(public._is_story_owner(p_story_id) or v_story.assigned_editor_id = auth.uid(), false) then
    raise exception 'Only the story owner or assigned editor can list main-story options';
  end if;

  return query
    select s.id, r.title, s.slug
    from public.stories s
    join public.story_revisions r on r.id = s.published_revision_id
    where s.contributor_id = v_story.contributor_id
      and s.id <> p_story_id
      and s.lifecycle_status = 'published'
      and r.parent_story_id is null
    order by lower(r.title), s.id;
end;
$$;
comment on function public.list_parent_story_options(uuid) is
  'Owner or assigned editor: the same contributor''s published stories that are not themselves sub stories -- the candidates set_revision_parent_story() would accept (it re-checks everything; this list is a convenience, not the gate).';

revoke execute on function public.list_parent_story_options(uuid) from public, anon, authenticated;
grant execute on function public.list_parent_story_options(uuid) to authenticated;

-- --------------------------------------------------------------------------
-- get_published_story_family(): the public read. For a publicly visible
-- story: its main story (if that is publicly visible too) and its publicly
-- visible sub stories. Reads ONLY published revisions, on both ends.
-- Returns no row at all for a story that is not publicly visible.
-- --------------------------------------------------------------------------
create or replace function public.get_published_story_family(p_slug text)
returns table (
  parent jsonb,
  sub_stories jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_story public.stories;
  v_parent_story_id uuid;
begin
  select st.* into v_story from public.stories st where st.slug = p_slug;
  if not found or not public._story_is_publicly_visible(v_story.id) then
    return;
  end if;

  select sr.parent_story_id into v_parent_story_id
  from public.story_revisions sr where sr.id = v_story.published_revision_id;

  return query
    select
      (
        select jsonb_build_object('slug', p.slug, 'title', pr.title)
        from public.stories p
        join public.story_revisions pr on pr.id = p.published_revision_id
        where p.id = v_parent_story_id
          and p.id <> v_story.id
          and public._story_is_publicly_visible(p.id)
      ),
      (
        select coalesce(jsonb_agg(jsonb_build_object(
          'slug', c.slug,
          'title', cr.title,
          'excerpt', cr.excerpt
        ) order by c.published_at asc, c.id), '[]'::jsonb)
        from (
          select c0.*
          from public.stories c0
          join public.story_revisions cr0 on cr0.id = c0.published_revision_id
          where cr0.parent_story_id = v_story.id
            and c0.id <> v_story.id
            and public._story_is_publicly_visible(c0.id)
          order by c0.published_at asc, c0.id
          limit 50
        ) c
        join public.story_revisions cr on cr.id = c.published_revision_id
      );
end;
$$;
comment on function public.get_published_story_family(text) is
  'Public: for a publicly visible story, its publicly visible main story ({slug,title} or null) and up to 50 publicly visible sub stories ([{slug,title,excerpt}], oldest publication first). Only published revisions are read, and both ends of every link pass _story_is_publicly_visible(). No row for a story that is not publicly visible.';

revoke execute on function public.get_published_story_family(text) from public, anon, authenticated;
grant execute on function public.get_published_story_family(text) to anon, authenticated;

-- --------------------------------------------------------------------------
-- create_next_draft_revision(): copy parent_story_id into the new draft, or
-- editing a published sub story would silently unlink it. Body extracted
-- verbatim from 20260903140100_custom_destination_reads_and_copy.sql (the
-- latest definition) with parent_story_id added to the revision insert.
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
    trip_year, travel_style, total_expense_nzd_cents, contributor_note, parent_story_id,
    created_by, updated_by
  )
  select
    p_story_id, v_next_number, title, excerpt, content_json, trip_start_date, trip_end_date,
    trip_year, travel_style, total_expense_nzd_cents, contributor_note, parent_story_id,
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
  insert into public.story_revision_locations
    (revision_id, region_id, destination_id, custom_destination_label, sort_order)
  select v_new_revision_id, region_id, destination_id, custom_destination_label, sort_order
  from public.story_revision_locations where revision_id = v_source_revision_id;

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
  'Starts the story''s next draft from its published (or latest terminal) revision. Copies EVERY per-revision child table -- locations, work types, tags, media and expenses -- including contributor-authored columns (custom labels, expense amounts/notes); the function body carries the checklist. Sets the draft pointer BEFORE copying child rows, or _protect_revision_child_immutability() rejects every copy; and strips embed tokens whose image was not carried over, so the new draft never starts in the state save_revision_draft refuses. Also carries the revision''s parent_story_id (sub stories, 20260930083209), so editing a published sub story keeps it filed under its main story.';

revoke execute on function public.create_next_draft_revision(uuid) from public, anon, authenticated;
grant execute on function public.create_next_draft_revision(uuid) to authenticated;
