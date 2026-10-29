-- Story journey map: ordered, contributor-pinned stops along a New Zealand
-- route, shown as an illustrated route on the story page.
--
-- ONE-LEVEL HIERARCHY. A stop is either a MAIN stop (parent_sort_order IS
-- NULL; these make up the route the van drives) or a SUB-STOP that belongs
-- to exactly one main stop (shown only when a reader opens that main stop).
-- The contributor chooses the grouping; nothing is clustered automatically.
-- Limits: 12 main stops, 8 sub-stops per main stop, 40 stops in total.
--
-- The linked Supabase project also serves production: this was applied there
-- deliberately on 2026-10-29 (recorded as 20261029042052).
--
-- PER-REVISION DATA, like every other child of story_revisions (expenses,
-- locations, tags). A stop belongs to a revision, so:
--   * a new draft gets its own COPY (create_next_draft_revision, below) and
--     editing it can never change what the PUBLISHED revision shows
--     (Engineering Rules 10 and 11);
--   * stops are reviewed with the revision in the normal moderation flow --
--     no separate queue;
--   * the shared _protect_revision_child_immutability() trigger freezes them
--     once the revision leaves draft.
--
-- PRIVACY (Rule 15: no exact live location). Coordinates are numeric(5,2)
-- and ROUNDED SERVER-SIDE inside set_revision_stops() to 2 decimals
-- (~1 km); nothing the client rounds is trusted. Anything outside a New
-- Zealand bounding box is REJECTED, not clamped. Readers are only ever
-- shown the contributor-written `label`; the public read function returns
-- coordinates solely so the illustration can place a pin, and the UI never
-- prints them.
--
-- WRITES: no direct grants and no policies. set_revision_stops() is the only
-- way in. READS: SECURITY DEFINER functions only -- get_published_story_stops
-- (public; approved published revision only) and get_revision_stops
-- (owner / linked contributor / assigned editor / admin, or a moderator once
-- the revision has left draft).
--
-- Reads are NEW functions rather than extra OUT columns on
-- get_published_story() / get_revision_selections() / get_story_for_moderator():
-- those have been drop-and-recreated many times and changing their return
-- types here would also break every caller until types are regenerated.

create table public.story_revision_stops (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.story_revisions (id) on delete restrict,
  sort_order integer not null,
  latitude numeric(5, 2) not null,
  longitude numeric(5, 2) not null,
  label text not null,
  -- Reference to a heading in the story's markdown, as produced by
  -- lib/story/headings.ts. NOT a foreign key (headings are not rows); the
  -- renderer shows no section link when it no longer matches.
  section_anchor text,
  -- NULL = main stop. Otherwise the sort_order of the MAIN stop (same
  -- revision) this sub-stop sits inside. set_revision_stops() guarantees the
  -- parent is itself a main stop (one level only); the composite FK below
  -- guarantees it exists in this revision and cascades if it is removed.
  parent_sort_order integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint story_revision_stops_latitude_nz check (latitude between -47.5 and -34.0),
  constraint story_revision_stops_longitude_nz check (longitude between 166.0 and 178.9),
  constraint story_revision_stops_label_length check (char_length(label) between 1 and 60),
  constraint story_revision_stops_label_not_blank check (btrim(label) <> ''),
  constraint story_revision_stops_anchor_shape check (
    section_anchor is null
    or (char_length(section_anchor) between 1 and 80 and section_anchor !~ '[[:space:]#]')
  ),
  constraint story_revision_stops_sort_order_non_negative check (sort_order >= 0),
  constraint story_revision_stops_order_unique unique (revision_id, sort_order),
  constraint story_revision_stops_parent_earlier check (
    parent_sort_order is null or parent_sort_order < sort_order
  ),
  constraint story_revision_stops_parent_fk
    foreign key (revision_id, parent_sort_order)
    references public.story_revision_stops (revision_id, sort_order)
    on delete cascade
);

create index story_revision_stops_revision_id_idx
  on public.story_revision_stops (revision_id);

create trigger story_revision_stops_set_updated_at
  before update on public.story_revision_stops
  for each row
  execute function public.set_updated_at();

create trigger story_revision_stops_protect_immutability
  before insert or update or delete on public.story_revision_stops
  for each row
  execute function public._protect_revision_child_immutability();

alter table public.story_revision_stops enable row level security;
-- No policies -- every access is a SECURITY DEFINER function.

-- Required: Supabase grants anon/authenticated broad table privileges on new
-- public tables regardless of RLS (see 20260803090900).
revoke all on public.story_revision_stops from public, anon, authenticated;

comment on table public.story_revision_stops is
  'Ordered journey-map stops for one story revision. Coordinates rounded to 2 dp and NZ-bounds-checked by set_revision_stops(); written only by it. No grants, no policies.';

-- --------------------------------------------------------------------------
-- set_revision_stops(): the only writer
-- --------------------------------------------------------------------------
-- Same shape as set_revision_expenses(): _authorize_revision_edit() (owner /
-- linked contributor / assigned editor AND _revision_is_editable()),
-- optimistic-version check, replace the whole set, bump stories.version.
-- Array position IS the order: any sort_order the client sends is ignored.
--
-- Each element: { latitude, longitude, label, section_anchor, parent_index }.
-- parent_index is the 0-based ARRAY POSITION of the main stop a sub-stop
-- sits inside (null/absent = main stop). It is converted here to the parent's
-- sort_order; no client-sent sort_order or id is trusted.
-- Rules enforced HERE (the client repeats them only for friendliness):
--   * more than 40 stops in total, 12 main stops, or 8 sub-stops in one
--     main stop                       -> exception
--   * parent_index not an integer, not pointing at an EARLIER element, or
--     pointing at an element that is itself a sub-stop -> exception
--   * coordinates missing/non-numeric -> exception
--   * rounded coordinates outside NZ  -> exception (never silently clamped)
--   * blank label                     -> exception; over 60 chars is cut
--   * section_anchor                  -> trimmed; null if blank
create or replace function public.set_revision_stops(
  p_revision_id uuid, p_expected_version integer, p_stops jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_story_id uuid;
  v_version integer;
  v_stops jsonb := coalesce(p_stops, '[]'::jsonb);
  v_bad integer;
begin
  select public._authorize_revision_edit(p_revision_id) into v_story_id;
  select version into v_version from public.stories where id = v_story_id;
  if v_version <> p_expected_version then
    raise exception 'Stale version for story % (expected %, got %)', v_story_id, v_version, p_expected_version;
  end if;

  if jsonb_typeof(v_stops) <> 'array' then
    raise exception 'Journey stops must be a JSON array';
  end if;
  if jsonb_array_length(v_stops) > 40 then
    raise exception 'A story can have at most 40 journey stops in total';
  end if;

  -- Hierarchy rules, checked on the raw array BEFORE anything is written.
  -- Element i is a sub-stop when it carries a non-null parent_index.
  select count(*) into v_bad
  from jsonb_array_elements(v_stops) as t(rec)
  where t.rec ->> 'parent_index' is not null
    and t.rec ->> 'parent_index' !~ '^[0-9]{1,6}$';
  if v_bad > 0 then
    raise exception 'parent_index must be a whole number or null';
  end if;

  with el as (
    select (t.ord - 1)::integer as idx,
           (t.rec ->> 'parent_index')::integer as p
    from jsonb_array_elements(v_stops) with ordinality as t(rec, ord)
  )
  select count(*) into v_bad
  from el c
  left join el par on par.idx = c.p
  where c.p is not null
    and (par.idx is null or par.idx >= c.idx or par.p is not null);
  if v_bad > 0 then
    raise exception 'A sub-stop must sit inside an earlier main stop (one level only)';
  end if;

  select count(*) into v_bad
  from jsonb_array_elements(v_stops) as t(rec)
  where t.rec ->> 'parent_index' is null;
  if v_bad > 12 then
    raise exception 'A story can have at most 12 main journey stops';
  end if;

  select coalesce(max(n), 0) into v_bad
  from (
    select count(*) as n
    from jsonb_array_elements(v_stops) as t(rec)
    where t.rec ->> 'parent_index' is not null
    -- Group on the integer, so "02" and "2" count as the same parent.
    group by (t.rec ->> 'parent_index')::integer
  ) g;
  if v_bad > 8 then
    raise exception 'A main journey stop can have at most 8 places inside it';
  end if;

  delete from public.story_revision_stops where revision_id = p_revision_id;

  -- Out-of-bounds coordinates, blank labels and malformed anchors are
  -- rejected by the table's CHECK constraints, which abort this whole
  -- function (the delete above rolls back with it).
  -- parent_sort_order = the parent's array position (validated above to be
  -- an earlier main stop). The composite FK is checked at statement end, so
  -- insertion order within this one statement does not matter.
  insert into public.story_revision_stops
    (revision_id, sort_order, latitude, longitude, label, section_anchor, parent_sort_order)
  select
    p_revision_id,
    (t.ord - 1)::integer,
    round((t.rec ->> 'latitude')::numeric, 2),
    round((t.rec ->> 'longitude')::numeric, 2),
    left(btrim(coalesce(t.rec ->> 'label', '')), 60),
    nullif(btrim(coalesce(t.rec ->> 'section_anchor', '')), ''),
    (t.rec ->> 'parent_index')::integer
  from jsonb_array_elements(v_stops) with ordinality as t(rec, ord);

  update public.stories set version = version + 1 where id = v_story_id;
end;
$$;

comment on function public.set_revision_stops(uuid, integer, jsonb) is
  'Replaces a revision''s journey-map stops. Same edit-rights rule and optimistic-version check as every other authoring RPC. Array order is the route order; coordinates are rounded to 2 dp and must fall inside the NZ bounding box (rejected, not clamped); max 12 main stops, 8 sub-stops per main stop and 40 stops in total; a sub-stop (parent_index) must point at an earlier main stop.';

revoke execute on function public.set_revision_stops(uuid, integer, jsonb)
  from public, anon, authenticated;
grant execute on function public.set_revision_stops(uuid, integer, jsonb) to authenticated;

-- --------------------------------------------------------------------------
-- get_published_story_stops(): the PUBLIC read
-- --------------------------------------------------------------------------
-- Gate = _story_is_publicly_visible(): public + published + not consent-
-- revoked + published revision approved + valid consent -- the same checks
-- get_published_story() makes. Reads ONLY published_revision_id, so no draft,
-- pending or rejected revision's stops are reachable (Rules 10-12).
create or replace function public.get_published_story_stops(p_slug text)
returns table (
  sort_order integer,
  latitude numeric,
  longitude numeric,
  label text,
  section_anchor text,
  parent_sort_order integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_story_id uuid;
  v_revision_id uuid;
begin
  select st.id, st.published_revision_id into v_story_id, v_revision_id
  from public.stories st
  where st.slug = p_slug;
  if v_story_id is null or v_revision_id is null then
    return;
  end if;
  if not public._story_is_publicly_visible(v_story_id) then
    return;
  end if;

  return query
    select s.sort_order, s.latitude, s.longitude, s.label, s.section_anchor, s.parent_sort_order
    from public.story_revision_stops s
    where s.revision_id = v_revision_id
    order by s.sort_order;
end;
$$;

comment on function public.get_published_story_stops(text) is
  'Journey-map stops of a story''s approved, published revision; empty unless the story is publicly visible. Public.';

revoke execute on function public.get_published_story_stops(text) from public, anon, authenticated;
grant execute on function public.get_published_story_stops(text) to anon, authenticated;

-- --------------------------------------------------------------------------
-- get_revision_stops(): authoring / preview / moderation read
-- --------------------------------------------------------------------------
-- Authoring and preview: owner, linked contributor, assigned editor, admin
-- (the get_revision_selections() rule). Moderators additionally see any
-- revision that has left draft, so a reviewer sees what they approve without
-- being able to read a contributor's in-progress draft.
create or replace function public.get_revision_stops(p_revision_id uuid)
returns table (
  sort_order integer,
  latitude numeric,
  longitude numeric,
  label text,
  section_anchor text,
  parent_sort_order integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_story_id uuid;
  v_status public.story_revision_status;
begin
  select r.story_id, r.revision_status into v_story_id, v_status
  from public.story_revisions r where r.id = p_revision_id;
  if v_story_id is null then
    raise exception 'No such revision: %', p_revision_id;
  end if;

  if not coalesce(
    public._is_story_owner(v_story_id)
    or exists (
      select 1 from public.stories s
      where s.id = v_story_id and s.assigned_editor_id = auth.uid()
    )
    or public.has_role(auth.uid(), 'admin')
    or (v_status <> 'draft' and public.has_role(auth.uid(), 'moderator')),
    false
  ) then
    raise exception 'Not authorized to read revision % stops', p_revision_id;
  end if;

  return query
    select s.sort_order, s.latitude, s.longitude, s.label, s.section_anchor, s.parent_sort_order
    from public.story_revision_stops s
    where s.revision_id = p_revision_id
    order by s.sort_order;
end;
$$;

comment on function public.get_revision_stops(uuid) is
  'Journey-map stops of one revision for the editor, preview and moderation review. Owner / linked contributor / assigned editor / admin, or a moderator once the revision has left draft.';

revoke execute on function public.get_revision_stops(uuid) from public, anon, authenticated;
grant execute on function public.get_revision_stops(uuid) to authenticated;

-- --------------------------------------------------------------------------
-- The two CHILD-TABLE CHECKLIST sites. Both bodies are the LATEST live
-- definitions (20261003051644 and 20260907100100 respectively), extracted
-- verbatim with only the stops lines added -- plus, in
-- create_next_draft_revision, the hosted database's custom_region_label copy
-- (see the comment at that insert).
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
  --   story_revision_stops      (sort_order, latitude, longitude, label, section_anchor,
  --                              parent_sort_order)
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

  -- Journey-map stops, main and sub (20261029042052). Every contributor-authored column.
  -- Copied WITHOUT re-validation: the source rows already passed
  -- set_revision_stops() and the table's CHECK constraints.
  -- parent_sort_order is copied verbatim: sort_order values are identical in
  -- the copy, so the composite parent FK holds within the new revision.
  insert into public.story_revision_stops
    (revision_id, sort_order, latitude, longitude, label, section_anchor, parent_sort_order)
  select v_new_revision_id, sort_order, latitude, longitude, label, section_anchor, parent_sort_order
  from public.story_revision_stops where revision_id = v_source_revision_id;

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
  'Starts the story''s next draft from its published (or latest terminal) revision. Copies EVERY per-revision child table -- locations, work types, tags, media, expenses and journey-map stops -- including contributor-authored columns; the function body carries the checklist. Sets the draft pointer BEFORE copying child rows, or _protect_revision_child_immutability() rejects every copy; and strips embed tokens whose image was not carried over.';
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
  --   story_revision_stops
  -- Adding a per-revision table means editing BOTH sites in the same
  -- change. Three migrations now exist only because that did not happen.
  delete from public.story_revision_media where revision_id = v_revision.id;
  delete from public.story_media where story_id = p_story_id;
  delete from public.story_revision_locations where revision_id = v_revision.id;
  delete from public.story_revision_work_types where revision_id = v_revision.id;
  delete from public.story_revision_tags where revision_id = v_revision.id;
  delete from public.story_revision_expenses where revision_id = v_revision.id;
  delete from public.story_revision_stops where revision_id = v_revision.id;

  update public.stories set current_draft_revision_id = null where id = p_story_id;
  delete from public.story_revisions where id = v_revision.id;
  delete from public.stories where id = p_story_id;
end;
$$;

comment on function public.delete_draft_story(uuid, integer) is
  'Hard-deletes a never-published draft OR private story and every per-revision child row it owns. The function body carries the child-table checklist; it is one of TWO sites that enumerate those tables (create_next_draft_revision copies the same list), and both must be updated together when a new one is added -- every child FK is `on delete restrict`, so a missed table makes this fail and roll back silently rather than loudly.';

revoke execute on function public.delete_draft_story(uuid, integer) from public, anon, authenticated;
grant execute on function public.delete_draft_story(uuid, integer) to authenticated;