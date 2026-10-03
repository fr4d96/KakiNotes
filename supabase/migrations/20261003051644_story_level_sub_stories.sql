-- Sub stories, take two: the link moves from story_revisions onto stories,
-- and it goes live as soon as the owner sets it.
--
-- WHY. The product owner decided (2026-10-03) that only stories that are
-- ALREADY PUBLISHED can be linked, and that the link should show straight
-- away instead of waiting for another review round. Both stories have each
-- been approved on their own; the link adds only "these two belong
-- together", between two stories by the same contributor. So the link is no
-- longer revision content and no longer moderated -- a deliberate, documented
-- exception to Engineering Rule 11 for this one field
-- (docs/content-governance.md, "Sub stories").
--
-- What still holds, enforced in set_story_parent_story(), the only writer:
--   * only the story's OWNER can set it (not an assigned editor -- this goes
--     public without review, so it stays the contributor's own decision);
--   * BOTH stories must be published to link them (clearing is always
--     allowed, since that only removes something);
--   * same contributor, not itself, two levels only (WHV10-WHV15).
-- Public reads (get_published_story_family) still check BOTH ends with the
-- same visibility gate as get_published_story(): if either story is later
-- archived, taken down or loses consent, the link simply stops showing
-- (Rules 10, 12).
--
-- stories has no direct API grants and RLS with zero policies
-- (20260803090100_stories.sql), so the new column is writable only through
-- the SECURITY DEFINER function below.
--
-- The old revision-level column and its two RPCs are removed. Any link that
-- was already public (both ends published, set on the published revision)
-- is carried over first; links that were only on drafts are dropped, since
-- drafts can no longer be linked.

alter table public.stories
  add column parent_story_id uuid references public.stories (id) on delete restrict,
  add constraint stories_parent_story_not_self
    check (parent_story_id is null or parent_story_id <> id);

comment on column public.stories.parent_story_id is
  'The main story this story is linked under, or null. Same contributor, both published when set, two levels only. Written only by set_story_parent_story(); public the moment it is set (not moderated -- see 20261003 header). Public reads follow it only when both ends pass _story_is_publicly_visible().';

create index stories_parent_story_id_idx
  on public.stories (parent_story_id)
  where parent_story_id is not null;

-- Carry over links that were already public.
update public.stories c
  set parent_story_id = r.parent_story_id
  from public.story_revisions r, public.stories p
  where r.id = c.published_revision_id
    and r.parent_story_id is not null
    and p.id = r.parent_story_id
    and p.id <> c.id
    and p.contributor_id = c.contributor_id
    and c.lifecycle_status = 'published'
    and p.lifecycle_status = 'published';

-- --------------------------------------------------------------------------
-- Remove the revision-level link.
-- --------------------------------------------------------------------------
drop function public.set_revision_parent_story(uuid, integer, uuid);
drop function public.get_revision_parent_story(uuid);

-- The freeze trigger, back to its original list (minus parent_story_id).
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
    then
      raise exception 'Revision content is immutable once it leaves draft status (revision %)', old.id;
    end if;
  end if;
  return new;
end;
$$;

-- create_next_draft_revision(): identical to 20260930083209 except it no
-- longer copies parent_story_id.
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
  'Starts the story''s next draft from its published (or latest terminal) revision. Copies EVERY per-revision child table -- locations, work types, tags, media and expenses -- including contributor-authored columns (custom labels, expense amounts/notes); the function body carries the checklist. Sets the draft pointer BEFORE copying child rows, or _protect_revision_child_immutability() rejects every copy; and strips embed tokens whose image was not carried over, so the new draft never starts in the state save_revision_draft refuses. (The sub-story link lives on stories since 20261003, so there is nothing to carry for it.)';
revoke execute on function public.create_next_draft_revision(uuid) from public, anon, authenticated;
grant execute on function public.create_next_draft_revision(uuid) to authenticated;

alter table public.story_revisions drop column parent_story_id;

-- --------------------------------------------------------------------------
-- _story_has_sub_stories(): is any other story linked under this one?
-- Internal; no API grant.
-- --------------------------------------------------------------------------
create or replace function public._story_has_sub_stories(p_story_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.stories child
    where child.parent_story_id = p_story_id
      and child.id <> p_story_id
  );
$$;
revoke execute on function public._story_has_sub_stories(uuid) from public, anon, authenticated;

-- --------------------------------------------------------------------------
-- set_story_parent_story(): the only writer. Null clears the link.
-- --------------------------------------------------------------------------
create or replace function public.set_story_parent_story(
  p_story_id uuid, p_parent_story_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_story public.stories;
  v_parent public.stories;
begin
  -- Ownership first, so nobody can take locks on someone else's stories.
  -- One message for "no such story" and "not yours".
  if not coalesce(public._is_story_owner(p_story_id), false) then
    raise exception 'Only the story owner can link it under a main story';
  end if;

  -- Lock this story and the main story in id order. Every link change that
  -- could break "two levels only" involves one story both sides touch, so
  -- they queue on that row's lock and the second one sees the first one's
  -- result instead of racing it.
  perform 1 from public.stories
    where id in (p_story_id, p_parent_story_id)
    order by id
    for update;

  select * into v_story from public.stories where id = p_story_id;

  if p_parent_story_id is not null then
    if v_story.lifecycle_status <> 'published' or v_story.published_revision_id is null then
      raise exception 'Only published stories can be linked' using errcode = 'WHV15';
    end if;
    if p_parent_story_id = p_story_id then
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
    if v_parent.parent_story_id is not null then
      raise exception 'That story is itself a sub story' using errcode = 'WHV13';
    end if;
    if public._story_has_sub_stories(p_story_id) then
      raise exception 'This story already has sub stories, so it cannot become one' using errcode = 'WHV14';
    end if;
  end if;

  -- No version bump on purpose: the link is not draft content, and bumping
  -- stories.version would make an open editor tab's next save fail as stale.
  update public.stories set parent_story_id = p_parent_story_id where id = p_story_id;
end;
$$;
comment on function public.set_story_parent_story(uuid, uuid) is
  'Owner only: links a published story under another of their published stories (public immediately), or clears the link with null. Refusals: WHV10 itself, WHV11 not found/not yours, WHV12 main story not published, WHV13 main story is itself a sub story, WHV14 this story already has sub stories, WHV15 this story is not published.';

revoke execute on function public.set_story_parent_story(uuid, uuid) from public, anon, authenticated;
grant execute on function public.set_story_parent_story(uuid, uuid) to authenticated;

-- --------------------------------------------------------------------------
-- get_story_parent_story(): what the My Stories link dialog shows. Always
-- exactly one row.
-- --------------------------------------------------------------------------
create or replace function public.get_story_parent_story(p_story_id uuid)
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
  v_parent_story_id uuid;
begin
  if not coalesce(public._is_story_owner(p_story_id), false) then
    raise exception 'Only the story owner can read its main story';
  end if;
  select s.parent_story_id into v_parent_story_id from public.stories s where s.id = p_story_id;

  return query
    select
      p.id,
      pr.title,
      p.slug,
      public._story_has_sub_stories(p_story_id)
    from (select 1) one
    left join public.stories p on p.id = v_parent_story_id
    left join public.story_revisions pr on pr.id = p.published_revision_id;
end;
$$;
comment on function public.get_story_parent_story(uuid) is
  'Owner only: the main story this story is linked under (id, published title, slug -- all null when none) and whether other stories are linked under this one (in which case it cannot become a sub story).';

revoke execute on function public.get_story_parent_story(uuid) from public, anon, authenticated;
grant execute on function public.get_story_parent_story(uuid) to authenticated;

-- --------------------------------------------------------------------------
-- list_parent_story_options(): the owner's published stories that could be
-- this story's main story.
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
  if not found or not coalesce(public._is_story_owner(p_story_id), false) then
    raise exception 'Only the story owner can list main-story options';
  end if;

  return query
    select s.id, r.title, s.slug
    from public.stories s
    join public.story_revisions r on r.id = s.published_revision_id
    where s.contributor_id = v_story.contributor_id
      and s.id <> p_story_id
      and s.lifecycle_status = 'published'
      and s.parent_story_id is null
    order by lower(r.title), s.id;
end;
$$;
comment on function public.list_parent_story_options(uuid) is
  'Owner only: the same contributor''s published stories that are not themselves sub stories -- the candidates set_story_parent_story() would accept (it re-checks everything; this list is a convenience, not the gate).';

revoke execute on function public.list_parent_story_options(uuid) from public, anon, authenticated;
grant execute on function public.list_parent_story_options(uuid) to authenticated;

-- --------------------------------------------------------------------------
-- get_published_story_family(): same shape and same gate as before; it now
-- follows stories.parent_story_id.
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
begin
  select st.* into v_story from public.stories st where st.slug = p_slug;
  if not found or not public._story_is_publicly_visible(v_story.id) then
    return;
  end if;

  return query
    select
      (
        select jsonb_build_object('slug', p.slug, 'title', pr.title)
        from public.stories p
        join public.story_revisions pr on pr.id = p.published_revision_id
        where p.id = v_story.parent_story_id
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
          where c0.parent_story_id = v_story.id
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
  'Public: for a publicly visible story, its publicly visible main story ({slug,title} or null) and up to 50 publicly visible sub stories ([{slug,title,excerpt}], oldest publication first), following stories.parent_story_id. Both ends of every link pass _story_is_publicly_visible(). No row for a story that is not publicly visible.';

revoke execute on function public.get_published_story_family(text) from public, anon, authenticated;
grant execute on function public.get_published_story_family(text) to anon, authenticated;
