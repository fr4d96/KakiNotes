-- A contributor can name a region/area that is not in the curated `regions`
-- list, for the same reason 20260903140000 let them type a destination:
-- `regions` is a genuinely closed set for New Zealand (16 rows, every
-- public filter and the /costs by-region cut key off it) but China ships
-- with only five seeded provinces/municipalities (20261014085842), and the
-- owner's own upcoming Guangzhou trip is already evidence that "the region
-- I actually want" is often missing for a second country with a much
-- thinner curated list.
--
-- SHAPE COPIED FROM 20260903140000_custom_destination_labels.sql and
-- 20260903140100_custom_destination_reads_and_copy.sql: same trim/length
-- rule, same "exactly one of" CHECK pattern (this one IS a strict
-- exactly-one-of, unlike the destination one, because every location row
-- has always needed SOME region), same read/copy checklist.

-- --------------------------------------------------------------------------
-- Schema: region_id becomes nullable, custom_region_label is its free-text
-- twin.
-- --------------------------------------------------------------------------

alter table public.story_revision_locations
  alter column region_id drop not null;

alter table public.story_revision_locations
  add column custom_region_label text;

alter table public.story_revision_locations
  add constraint story_revision_locations_region_one_of check (
    (region_id is null) <> (custom_region_label is null)
  );

alter table public.story_revision_locations
  add constraint story_revision_locations_custom_region_label_length check (
    custom_region_label is null
    or (
      char_length(trim(custom_region_label)) > 0
      and char_length(custom_region_label) <= 120
    )
  );

-- A custom region has no curated row, so there is no `destinations` FK to
-- be a child of -- destination_id can only ever be a typed label on a
-- custom-region row. Mirrors story_revision_locations_destination_one_of's
-- "cannot carry BOTH a looked-up and a typed one" shape, one level up.
alter table public.story_revision_locations
  add constraint story_revision_locations_custom_region_no_destination_id check (
    custom_region_label is null or destination_id is null
  );

comment on column public.story_revision_locations.custom_region_label is
  'A contributor-typed region/area name, for somewhere not in the curated `regions` table for this story''s country. Mutually exclusive with region_id (story_revision_locations_region_one_of). A row with this set can still carry a typed destination/place (custom_destination_label) but never a destinations FK, since that FK is scoped to a curated region.';

-- --------------------------------------------------------------------------
-- Triggers: both re-created to allow region_id IS NULL (a custom-region row
-- carries no country of its own -- it inherits the story's country, and
-- there is no region row to validate a destination or a country against).
-- Bodies otherwise byte-for-byte the live definitions.
-- --------------------------------------------------------------------------

create or replace function public.story_revision_locations_validate_destination()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.region_id is null then
    return new;
  end if;
  if new.destination_id is not null then
    if not exists (
      select 1 from public.destinations
      where id = new.destination_id and region_id = new.region_id
    ) then
      raise exception 'destination % does not belong to region %', new.destination_id, new.region_id;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.story_revision_locations_validate_country()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_story_country_id uuid;
  v_region_country_id uuid;
begin
  if new.region_id is null then
    return new;
  end if;

  select s.country_id into v_story_country_id
  from public.story_revisions r
  join public.stories s on s.id = r.story_id
  where r.id = new.revision_id;

  select r.country_id into v_region_country_id
  from public.regions r
  where r.id = new.region_id;

  if v_story_country_id is null or v_region_country_id is null
     or v_story_country_id <> v_region_country_id then
    raise exception 'region % does not belong to the story''s country', new.region_id;
  end if;

  return new;
end;
$$;

-- --------------------------------------------------------------------------
-- The writer. set_revision_locations(uuid, integer, jsonb) -- same
-- signature, CREATE OR REPLACE is sufficient. A client sends EITHER
-- region_id OR custom_region_label; an id wins if a client sends both,
-- same precedence set_revision_locations() already applies between
-- destination_id and custom_destination_label.
-- --------------------------------------------------------------------------

create or replace function public.set_revision_locations(
  p_revision_id uuid, p_expected_version integer, p_locations jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_story_id uuid;
  v_version integer;
begin
  select public._authorize_revision_edit(p_revision_id) into v_story_id;
  select version into v_version from public.stories where id = v_story_id;
  if v_version <> p_expected_version then
    raise exception 'Stale version for story % (expected %, got %)', v_story_id, v_version, p_expected_version;
  end if;

  delete from public.story_revision_locations where revision_id = p_revision_id;

  insert into public.story_revision_locations
    (revision_id, region_id, custom_region_label, destination_id, custom_destination_label, sort_order)
  select
    p_revision_id,
    (rec ->> 'region_id')::uuid,
    -- A looked-up region wins, so a client sending both cannot trip the
    -- CHECK -- same precedence applied to destination below.
    case
      when nullif(rec ->> 'region_id', '') is not null then null
      else left(nullif(trim(rec ->> 'custom_region_label'), ''), 120)
    end,
    nullif(rec ->> 'destination_id', '')::uuid,
    case
      when nullif(rec ->> 'destination_id', '') is not null then null
      else left(nullif(trim(rec ->> 'custom_destination_label'), ''), 120)
    end,
    coalesce((rec ->> 'sort_order')::int, 0)
  from jsonb_array_elements(coalesce(p_locations, '[]'::jsonb)) as rec;

  update public.stories set version = version + 1 where id = v_story_id;
end;
$$;

comment on function public.set_revision_locations(uuid, integer, jsonb) is
  'Replaces a revision''s locations. Region is either a `regions` reference or a contributor-typed label (20261015: custom_region_label); the destination is either a `destinations` reference, a contributor-typed label, or absent (region-only). An id always wins over a same-row typed label if a client sends both. The enforcing boundary, not the client.';

revoke execute on function public.set_revision_locations(uuid, integer, jsonb)
  from public, anon, authenticated;
grant execute on function public.set_revision_locations(uuid, integer, jsonb) to authenticated;

-- --------------------------------------------------------------------------
-- The authoring reader. get_revision_selections(uuid) -- same signature and
-- output shape (locations stays jsonb), CREATE OR REPLACE is sufficient.
-- Body is otherwise byte-for-byte 20260903140100's definition; only the
-- locations jsonb_build_object gains customRegionLabel.
-- --------------------------------------------------------------------------

create or replace function public.get_revision_selections(p_revision_id uuid)
returns table (
  locations jsonb,
  work_types jsonb,
  tags jsonb,
  expenses jsonb
)
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
    raise exception 'No such revision: %', p_revision_id;
  end if;

  if not (
    public._is_story_owner(v_story_id)
    or exists (
      select 1 from public.stories s
      where s.id = v_story_id and s.assigned_editor_id = auth.uid()
    )
    or public.has_role(auth.uid(), 'admin')
  ) then
    raise exception 'Not authorized to read revision % selections', p_revision_id;
  end if;

  return query
    select
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'regionId', l.region_id,
              'customRegionLabel', l.custom_region_label,
              'destinationId', l.destination_id,
              'customDestinationLabel', l.custom_destination_label,
              'sortOrder', l.sort_order
            )
            order by l.sort_order
          )
          from public.story_revision_locations l
          where l.revision_id = p_revision_id
        ),
        '[]'::jsonb
      ),
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'workTypeId', wt.work_type_id,
              'customLabel', wt.custom_label
            )
          )
          from public.story_revision_work_types wt
          where wt.revision_id = p_revision_id
        ),
        '[]'::jsonb
      ),
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'tagId', t.tag_id,
              'customLabel', t.custom_label,
              'name', coalesce(tg.name, t.custom_label)
            )
            order by coalesce(tg.name, t.custom_label)
          )
          from public.story_revision_tags t
          left join public.tags tg on tg.id = t.tag_id
          where t.revision_id = p_revision_id
        ),
        '[]'::jsonb
      ),
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'categoryId', e.category_id,
              'slug', ec.slug,
              'name', coalesce(ec.name, e.custom_label),
              'customLabel', e.custom_label,
              'amountNzdCents', e.amount_nzd_cents,
              'note', e.note
            )
            order by coalesce(ec.sort_order, 2147483647),
                     coalesce(ec.name, e.custom_label)
          )
          from public.story_revision_expenses e
          left join public.expense_categories ec on ec.id = e.category_id
          where e.revision_id = p_revision_id
        ),
        '[]'::jsonb
      );
end;
$$;

comment on function public.get_revision_selections(uuid) is
  'Reads back a revision''s selected locations/work types/tags/expenses for the authoring edit form. Tags and expense categories carry their resolved display name so a retired (inactive) lookup row still renders. A location row carries either regionId or customRegionLabel (20261015), same as destinationId/customDestinationLabel already did. Same edit-rights rule as the writer RPCs (owner, linked contributor, assigned editor, admin) -- never a broader set.';

revoke execute on function public.get_revision_selections(uuid) from public, anon, authenticated;
grant execute on function public.get_revision_selections(uuid) to authenticated;

-- --------------------------------------------------------------------------
-- create_next_draft_revision(uuid) -- same signature, CREATE OR REPLACE is
-- sufficient. Only the story_revision_locations copy-list grows by one
-- column; every other child-table copy and the embed-token cleanup are
-- byte-for-byte 20260903140100's definition.
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
    trip_year, travel_style, total_expense_nzd_cents, contributor_note, created_by, updated_by
  )
  select
    p_story_id, v_next_number, title, excerpt, content_json, trip_start_date, trip_end_date,
    trip_year, travel_style, total_expense_nzd_cents, contributor_note, auth.uid(), auth.uid()
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
  --   story_revision_locations  (region_id, custom_region_label,
  --                              destination_id, custom_destination_label,
  --                              sort_order)
  --   story_revision_work_types (work_type_id, custom_label)
  --   story_revision_tags       (tag_id, custom_label)
  --   story_revision_media      (media_id, alt_text, caption, decorative,
  --                              sort_order, is_cover)
  --   story_revision_expenses   (category_id, custom_label, amount_nzd_cents, note)
  -- If you add a table to that list, add it here in the same change. Two
  -- migrations (20260902100000, and this one) exist only because that did
  -- not happen. All of these must come AFTER the draft-pointer update
  -- above, or _protect_revision_child_immutability() rejects every row.
  -- custom_region_label too (20261015_custom_region_labels). Dropping it
  -- here would silently lose a contributor-typed region the moment they
  -- edit a published story -- no constraint would catch it, because the
  -- row would simply have neither region_id nor custom_region_label... no,
  -- it WOULD be caught here: story_revision_locations_region_one_of would
  -- reject a row with neither. Copying it is still required so the data
  -- itself is not lost.
  insert into public.story_revision_locations
    (revision_id, region_id, custom_region_label, destination_id, custom_destination_label, sort_order)
  select v_new_revision_id, region_id, custom_region_label, destination_id, custom_destination_label, sort_order
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
  'Starts the story''s next draft from its published (or latest terminal) revision. Copies EVERY per-revision child table -- locations, work types, tags, media and expenses -- including contributor-authored columns (custom labels, expense amounts/notes); the function body carries the checklist. Sets the draft pointer BEFORE copying child rows, or _protect_revision_child_immutability() rejects every copy; and strips embed tokens whose image was not carried over, so the new draft never starts in the state save_revision_draft refuses.';

revoke execute on function public.create_next_draft_revision(uuid) from public, anon, authenticated;
grant execute on function public.create_next_draft_revision(uuid) to authenticated;

-- --------------------------------------------------------------------------
-- Public/staff readers that join `regions` to show a region's display name.
-- Every one of them switches its region join from INNER to LEFT and emits
-- coalesce(reg.name, loc.custom_region_label) as region_name -- a custom
-- row has no `regions` row to inner-join against, so an inner join would
-- silently drop it from every list/detail/export it appears in.
-- region_name_zh_cn stays reg.name_zh_cn (null for a custom row; a
-- contributor's own typed words are never machine-translated -- see
-- lib/i18n/vocab.ts's header). Each body below is otherwise byte-for-byte
-- its cited source, qualified with table aliases throughout.
-- --------------------------------------------------------------------------

-- list_published_stories(...): byte-for-byte 20261014085842_countries.sql,
-- only the locations subquery's join changes.
create or replace function public.list_published_stories(
  p_cursor_published_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 20,
  p_region_id uuid default null,
  p_destination_id uuid default null,
  p_work_type_id uuid default null,
  p_tag_id uuid default null,
  p_trip_year smallint default null,
  p_travel_style text default null,
  p_contributor_id uuid default null,
  p_cost_band text default null,
  p_has_reported_expense boolean default null,
  p_exclude_story_id uuid default null,
  p_search text default null,
  p_country_slug text default 'new-zealand'
)
returns table (
  story_id uuid,
  slug text,
  title text,
  excerpt text,
  published_at timestamptz,
  trip_year smallint,
  travel_style text,
  total_expense_nzd_cents integer,
  attribution_type public.attribution_type,
  attribution_value text,
  contributor_slug text,
  contributor_avatar_emoji text,
  cover_image_path text,
  regions jsonb,
  work_types jsonb,
  tags jsonb,
  cover_media_id uuid,
  cover_storage_backend text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_query tsquery;
  v_country_id uuid;
begin
  if p_cost_band is not null and p_cost_band not in ('under_5k', '5k_15k', '15k_30k', '30k_plus') then
    raise exception 'Invalid cost band: %', p_cost_band;
  end if;

  if p_search is not null and length(trim(p_search)) > 0 then
    v_query := websearch_to_tsquery('simple', p_search);
  end if;

  if p_country_slug is not null then
    select co.id into v_country_id from public.countries co where co.slug = p_country_slug and co.active = true;
    if v_country_id is null then
      return;
    end if;
  end if;

  return query
    select
      s.id, s.slug, r.title, r.excerpt, s.published_at, r.trip_year, r.travel_style,
      r.total_expense_nzd_cents, con.attribution_type,
      case when con.attribution_type = 'anonymous' then null else con.attribution_value end,
      case
        when c.public_status = 'public'
         and c.attribution_type <> 'anonymous'
         and con.attribution_type <> 'anonymous'
        then c.public_slug
        else null
      end,
      case
        when c.public_status = 'public'
         and c.attribution_type <> 'anonymous'
         and con.attribution_type <> 'anonymous'
        then c.avatar_emoji
        else null
      end,
      (
        select m.approved_public_storage_path
        from public.story_revision_media rm
        join public.story_media m on m.id = rm.media_id
        where rm.revision_id = r.id
          and m.approved_public_storage_path is not null
          and m.metadata_removed_at is not null
        order by rm.is_cover desc, rm.sort_order asc
        limit 1
      ),
      (
        select coalesce(jsonb_agg(jsonb_build_object(
          'region_name', coalesce(reg.name, loc.custom_region_label),
          'region_name_zh_cn', reg.name_zh_cn,
          'destination_name', coalesce(dest.name, loc.custom_destination_label),
          'destination_name_zh_cn', dest.name_zh_cn
        ) order by loc.sort_order), '[]'::jsonb)
        from public.story_revision_locations loc
        left join public.regions reg on reg.id = loc.region_id
        left join public.destinations dest on dest.id = loc.destination_id
        where loc.revision_id = r.id
      ),
      (
        select coalesce(jsonb_agg(coalesce(wt.name, srwt.custom_label)), '[]'::jsonb)
        from public.story_revision_work_types srwt
        left join public.work_types wt on wt.id = srwt.work_type_id
        where srwt.revision_id = r.id
      ),
      (
        select coalesce(jsonb_agg(coalesce(t.name, srt.custom_label)), '[]'::jsonb)
        from public.story_revision_tags srt
        left join public.tags t on t.id = srt.tag_id
        where srt.revision_id = r.id
      ),
      (
        select rm.media_id
        from public.story_revision_media rm
        join public.story_media m on m.id = rm.media_id
        where rm.revision_id = r.id
          and (
            (m.storage_backend = 'supabase' and m.approved_public_storage_path is not null and m.metadata_removed_at is not null)
            or (m.storage_backend = 'google_drive' and m.processing_state = 'promoted' and m.drive_processed_file_id is not null)
          )
        order by rm.is_cover desc, rm.sort_order asc
        limit 1
      ),
      (
        select m.storage_backend
        from public.story_revision_media rm
        join public.story_media m on m.id = rm.media_id
        where rm.revision_id = r.id
          and (
            (m.storage_backend = 'supabase' and m.approved_public_storage_path is not null and m.metadata_removed_at is not null)
            or (m.storage_backend = 'google_drive' and m.processing_state = 'promoted' and m.drive_processed_file_id is not null)
          )
        order by rm.is_cover desc, rm.sort_order asc
        limit 1
      )
    from public.stories s
    join public.story_revisions r
      on r.id = s.published_revision_id and r.story_id = s.id and r.revision_status = 'approved'
    join lateral (
      select * from public.story_publication_consents spc
      where spc.story_id = s.id and spc.revision_id = s.published_revision_id and spc.consent_status = 'granted'
      limit 1
    ) con on true
    left join public.contributors c on c.id = s.contributor_id
    where s.visibility = 'public'
      and s.lifecycle_status = 'published'
      and s.consent_revoked_at is null
      and (p_country_slug is null or s.country_id = v_country_id)
      and (p_contributor_id is null or s.contributor_id = p_contributor_id)
      and (p_trip_year is null or r.trip_year = p_trip_year)
      and (p_travel_style is null or r.travel_style = p_travel_style)
      and (p_exclude_story_id is null or s.id <> p_exclude_story_id)
      and (v_query is null or r.search_vector @@ v_query)
      and (
        p_has_reported_expense is null
        or (p_has_reported_expense and r.total_expense_nzd_cents is not null)
        or (not p_has_reported_expense and r.total_expense_nzd_cents is null)
      )
      and (
        p_cost_band is null
        or (
          r.total_expense_nzd_cents is not null
          and (
            (p_cost_band = 'under_5k' and r.total_expense_nzd_cents < 500000)
            or (p_cost_band = '5k_15k' and r.total_expense_nzd_cents >= 500000 and r.total_expense_nzd_cents < 1500000)
            or (p_cost_band = '15k_30k' and r.total_expense_nzd_cents >= 1500000 and r.total_expense_nzd_cents < 3000000)
            or (p_cost_band = '30k_plus' and r.total_expense_nzd_cents >= 3000000)
          )
        )
      )
      and (
        p_work_type_id is null
        or exists (
          select 1 from public.story_revision_work_types wt
          where wt.revision_id = r.id and wt.work_type_id = p_work_type_id
        )
      )
      and (
        p_tag_id is null
        or exists (
          select 1 from public.story_revision_tags t
          where t.revision_id = r.id and t.tag_id = p_tag_id
        )
      )
      and (
        -- Region FILTERS stay curated-only: p_region_id is a `regions`
        -- uuid, which a custom-region row can never match (its region_id
        -- is null) -- the same "filters stay curated, display doesn't"
        -- split get_expense_aggregates()'s by_region breakdown keeps below.
        (p_region_id is null and p_destination_id is null)
        or exists (
          select 1 from public.story_revision_locations loc
          where loc.revision_id = r.id
            and (p_region_id is null or loc.region_id = p_region_id)
            and (p_destination_id is null or loc.destination_id = p_destination_id)
        )
      )
      and (
        p_cursor_published_at is null
        or (s.published_at, s.id) < (p_cursor_published_at, p_cursor_id)
      )
    order by s.published_at desc, s.id desc
    limit v_limit;
end;
$$;

revoke execute on function public.list_published_stories(
  timestamptz, uuid, integer, uuid, uuid, uuid, uuid, smallint, text, uuid, text, boolean, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.list_published_stories(
  timestamptz, uuid, integer, uuid, uuid, uuid, uuid, smallint, text, uuid, text, boolean, uuid, text, text
) to anon, authenticated;

-- get_published_story(text, text): byte-for-byte 20261014085842_countries.sql,
-- only the locations subquery's join changes.
create or replace function public.get_published_story(p_slug text, p_country_slug text default null)
returns table (
  story_id uuid,
  slug text,
  title text,
  excerpt text,
  content_json jsonb,
  trip_start_date date,
  trip_end_date date,
  trip_year smallint,
  travel_style text,
  total_expense_nzd_cents integer,
  published_at timestamptz,
  attribution_type public.attribution_type,
  attribution_value text,
  contributor_slug text,
  contributor_avatar_emoji text,
  regions jsonb,
  work_types jsonb,
  tags jsonb,
  expenses jsonb,
  country_slug text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_story public.stories;
  v_consent public.story_publication_consents;
  v_contributor public.contributors;
  v_country_id uuid;
begin
  if p_country_slug is not null then
    select co.id into v_country_id from public.countries co where co.slug = p_country_slug and co.active = true;
    if v_country_id is null then
      return;
    end if;
  end if;

  select st.* into v_story from public.stories st
    where st.slug = p_slug and st.visibility = 'public' and st.lifecycle_status = 'published'
      and (p_country_slug is null or st.country_id = v_country_id);
  if not found or v_story.published_revision_id is null or v_story.consent_revoked_at is not null then
    return;
  end if;

  if not exists (
    select 1 from public.story_revisions sr
    where sr.id = v_story.published_revision_id
      and sr.story_id = v_story.id
      and sr.revision_status = 'approved'
  ) then
    return;
  end if;

  v_consent := public._latest_valid_consent_for_revision(v_story.id, v_story.published_revision_id);
  if v_consent is null then
    return;
  end if;

  select * into v_contributor from public.contributors where id = v_story.contributor_id;

  return query
    select
      v_story.id, v_story.slug, r.title, r.excerpt, r.content_json, r.trip_start_date, r.trip_end_date,
      r.trip_year, r.travel_style, r.total_expense_nzd_cents, v_story.published_at,
      v_consent.attribution_type,
      case when v_consent.attribution_type = 'anonymous' then null
           else v_consent.attribution_value end,
      case
        when v_contributor.public_status = 'public'
         and v_contributor.attribution_type <> 'anonymous'
         and v_consent.attribution_type <> 'anonymous'
        then v_contributor.public_slug
        else null
      end,
      case
        when v_contributor.public_status = 'public'
         and v_contributor.attribution_type <> 'anonymous'
         and v_consent.attribution_type <> 'anonymous'
        then v_contributor.avatar_emoji
        else null
      end,
      (
        select coalesce(jsonb_agg(jsonb_build_object(
          'region_name', coalesce(reg.name, loc.custom_region_label),
          'region_name_zh_cn', reg.name_zh_cn,
          'destination_name', coalesce(dest.name, loc.custom_destination_label),
          'destination_name_zh_cn', dest.name_zh_cn
        ) order by loc.sort_order), '[]'::jsonb)
        from public.story_revision_locations loc
        left join public.regions reg on reg.id = loc.region_id
        left join public.destinations dest on dest.id = loc.destination_id
        where loc.revision_id = r.id
      ),
      (
        select coalesce(jsonb_agg(coalesce(wt.name, srwt.custom_label)), '[]'::jsonb)
        from public.story_revision_work_types srwt
        left join public.work_types wt on wt.id = srwt.work_type_id
        where srwt.revision_id = r.id
      ),
      (
        select coalesce(jsonb_agg(coalesce(t.name, srt.custom_label)), '[]'::jsonb)
        from public.story_revision_tags srt
        left join public.tags t on t.id = srt.tag_id
        where srt.revision_id = r.id
      ),
      (
        select coalesce(jsonb_agg(jsonb_build_object(
          'name', coalesce(ec.name, e.custom_label),
          'name_zh_cn', ec.name_zh_cn,
          'amount_nzd_cents', e.amount_nzd_cents,
          'note', e.note
        ) order by coalesce(ec.sort_order, 2147483647),
                   coalesce(ec.name, e.custom_label)), '[]'::jsonb)
        from public.story_revision_expenses e
        left join public.expense_categories ec on ec.id = e.category_id
        where e.revision_id = r.id
      ),
      (select co.slug from public.countries co where co.id = v_story.country_id)
    from public.story_revisions r
    where r.id = v_story.published_revision_id;
end;
$$;

comment on function public.get_published_story(text, text) is
  'Public, anon-readable. Same invariants as before this migration, plus an optional p_country_slug: when provided, a story whose country does not match returns no rows, same as an unknown slug. Appends country_slug to the result so callers can display/validate without a second lookup. Region join is LEFT (20261015) so a custom-region location still renders.';

revoke execute on function public.get_published_story(text, text) from public, anon, authenticated;
grant execute on function public.get_published_story(text, text) to anon, authenticated;

-- list_my_stories(): byte-for-byte 20260926110804_list_my_stories_revision_count.sql,
-- only the locations subquery's join changes. Return shape (jsonb regions)
-- is unchanged, so CREATE OR REPLACE is sufficient -- unlike every prior
-- change to this function, which added a column.
create or replace function public.list_my_stories()
returns table (
  id uuid, slug text, source_kind public.story_source_kind, visibility public.story_visibility,
  lifecycle_status public.story_lifecycle_status, current_draft_revision_id uuid,
  published_revision_id uuid, version integer, submitted_at timestamptz, published_at timestamptz,
  archived_at timestamptz, created_at timestamptz, updated_at timestamptz,
  title text, excerpt text, regions jsonb,
  cover_media_id uuid, cover_alt_text text,
  draft_revision_status public.story_revision_status,
  tags jsonb,
  revision_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.slug, s.source_kind, s.visibility, s.lifecycle_status, s.current_draft_revision_id,
         s.published_revision_id, s.version, s.submitted_at, s.published_at, s.archived_at,
         s.created_at, s.updated_at, r.title, r.excerpt,
         (
           select coalesce(jsonb_agg(jsonb_build_object(
             'region_name', coalesce(reg.name, loc.custom_region_label),
             'region_name_zh_cn', reg.name_zh_cn,
             'destination_name', coalesce(dest.name, loc.custom_destination_label), 'destination_name_zh_cn', dest.name_zh_cn
           ) order by loc.sort_order), '[]'::jsonb)
           from public.story_revision_locations loc
           left join public.regions reg on reg.id = loc.region_id
           left join public.destinations dest on dest.id = loc.destination_id
           where loc.revision_id = r.id
         ),
         (
           select cover.media_id
           from public.story_revision_media cover
           where cover.revision_id = r.id
           order by cover.is_cover desc, cover.sort_order, cover.id
           limit 1
         ),
         (
           select cover.alt_text
           from public.story_revision_media cover
           where cover.revision_id = r.id
           order by cover.is_cover desc, cover.sort_order, cover.id
           limit 1
         ),
         dr.revision_status,
         (
           select coalesce(jsonb_agg(coalesce(t.name, srt.custom_label)), '[]'::jsonb)
           from public.story_revision_tags srt
           left join public.tags t on t.id = srt.tag_id
           where srt.revision_id = r.id
         ),
         (
           select count(*)::integer from public.story_revisions sr where sr.story_id = s.id
         )
  from public.stories s
  left join public.contributors c on c.id = s.contributor_id
  left join public.story_revisions r on r.id = coalesce(s.current_draft_revision_id, s.published_revision_id)
  left join public.story_revisions dr on dr.id = s.current_draft_revision_id
  where (s.source_kind = 'self_submitted' and s.owner_user_id = auth.uid())
     or (s.source_kind = 'editorial_import' and c.linked_user_id = auth.uid())
  order by s.updated_at desc;
$$;

comment on function public.list_my_stories() is
  'The caller''s own stories (owner of a self_submitted story, or the linked contributor of an editorial_import), with the coalesced current-draft-or-published revision''s title, excerpt, tagged regions (with zh-CN names; a custom region label renders with a null zh-CN twin, 20261015), tags, and cover reference (the flagged cover, else the first image), plus the CURRENT DRAFT revision''s status (null when nothing is in flight) and the story''s total revision_count -- the same count delete_draft_story() itself requires to equal 1 before it will hard-delete a story, so the client can hide Delete for a story with prior review history instead of offering an action the RPC will always refuse. `tags` resolves a lookup tag''s name OR the contributor''s own typed label, exactly as list_published_stories() does. Returns NO storage path of any kind for the cover -- only cover_media_id and cover_alt_text; the signed URL is minted separately after an independent authorization check.';

revoke execute on function public.list_my_stories() from public, anon, authenticated;
grant execute on function public.list_my_stories() to authenticated;

-- contributor_public_facts(uuid): byte-for-byte 20260914092352_contributor_facts_regions_zh_cn.sql,
-- only the regions subquery's join changes. Return shape (jsonb regions) is
-- unchanged, so CREATE OR REPLACE is sufficient -- unlike that migration's
-- own DROP+CREATE, which was forced by a column TYPE change this one does
-- not make.
create or replace function public.contributor_public_facts(p_contributor_id uuid)
returns table (
  published_story_count bigint,
  regions jsonb,
  trip_years smallint[],
  tags text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  with published as (
    select s.id as story_id, s.published_revision_id as revision_id, r.trip_year
    from public.stories s
    join public.story_revisions r
      on r.id = s.published_revision_id
     and r.story_id = s.id
     and r.revision_status = 'approved'
    where s.contributor_id = p_contributor_id
      and s.visibility = 'public'
      and s.lifecycle_status = 'published'
      and s.consent_revoked_at is null
      and exists (
        select 1 from public.story_publication_consents con
        where con.story_id = s.id
          and con.revision_id = s.published_revision_id
          and con.consent_status = 'granted'
      )
  )
  select
    (select count(*) from published),
    (
      -- LEFT join now (20261015): a custom-region row (region_id null) has
      -- no `regions` row to inner-join against, and an inner join here
      -- would silently drop it from the byline instead of showing the
      -- contributor's own typed name for it. DISTINCT over the resolved
      -- (name, name_zh_cn) pair, then one object per pair in English order
      -- -- a custom row's name_zh_cn is always null (never machine-
      -- translated), so it sorts and renders exactly as reg.name would.
      select coalesce(
        jsonb_agg(jsonb_build_object('name', x.name, 'name_zh_cn', x.name_zh_cn) order by x.name),
        '[]'::jsonb
      )
      from (
        select distinct coalesce(reg.name, loc.custom_region_label) as name, reg.name_zh_cn
        from published pub
        join public.story_revision_locations loc on loc.revision_id = pub.revision_id
        left join public.regions reg on reg.id = loc.region_id
      ) x
    ),
    (
      select coalesce(array_agg(distinct pub.trip_year order by pub.trip_year desc), '{}'::smallint[])
      from published pub
      where pub.trip_year is not null
    ),
    (
      select coalesce(
        array_agg(distinct coalesce(tg.name, srt.custom_label)
                  order by coalesce(tg.name, srt.custom_label)),
        '{}'::text[]
      )
      from published pub
      join public.story_revision_tags srt on srt.revision_id = pub.revision_id
      left join public.tags tg on tg.id = srt.tag_id
      where coalesce(tg.name, srt.custom_label) is not null
    );
$$;

comment on function public.contributor_public_facts(uuid) is
  'The single definition of "what is publicly true about this contributor" -- published story count plus regions/trip years/tags derived from ONLY their public, published, approved, consent-granted revisions (Engineering Rules 10 and 12). Regions are jsonb objects carrying name and name_zh_cn; a custom region label (20261015) renders with a null zh-CN twin, same as a custom destination label already did. Tags resolve a curated tag name OR the contributor-typed custom_label, per the LEFT-JOIN-and-coalesce rule public reads have used since 20260812110000. Internal: no grants, reachable only from the SECURITY DEFINER public RPCs.';

revoke all on function public.contributor_public_facts(uuid) from public, anon, authenticated;

-- get_story_for_moderator(uuid): byte-for-byte 20261007063355_story_media_drive_backend.sql,
-- only the region_names subquery's join changes.
create or replace function public.get_story_for_moderator(p_revision_id uuid)
returns table (
  story_id uuid,
  slug text,
  story_version integer,
  lifecycle_status public.story_lifecycle_status,
  source_kind text,
  submitted_at timestamptz,
  revision_id uuid,
  revision_number integer,
  revision_status public.story_revision_status,
  revision_updated_at timestamptz,
  title text,
  excerpt text,
  content_json jsonb,
  contributor_note text,
  trip_start_date date,
  trip_end_date date,
  trip_year smallint,
  travel_style text,
  total_expense_nzd_cents integer,
  contributor_display_name text,
  contributor_public_slug text,
  consent_valid boolean,
  media_processed boolean,
  attribution_type public.attribution_type,
  attribution_value text,
  confirmation_method text,
  consent_recorded_at timestamptz,
  image_rights_confirmed_at timestamptz,
  identifiable_people_state public.identifiable_people_state,
  region_names text[],
  tag_names text[],
  media jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_story public.stories;
begin
  if not (public.has_role(auth.uid(), 'moderator') or public.has_role(auth.uid(), 'admin')) then
    raise exception 'Only a moderator or admin can read this view';
  end if;

  select s.* into v_story
  from public.stories s
  join public.story_revisions r on r.story_id = s.id
  where r.id = p_revision_id;
  if not found then
    raise exception 'No such revision: %', p_revision_id;
  end if;

  return query
    select
      v_story.id,
      v_story.slug,
      v_story.version,
      v_story.lifecycle_status,
      v_story.source_kind::text,
      v_story.submitted_at,
      r.id,
      r.revision_number,
      r.revision_status,
      r.updated_at,
      r.title,
      r.excerpt,
      r.content_json,
      r.contributor_note,
      r.trip_start_date,
      r.trip_end_date,
      r.trip_year,
      r.travel_style,
      r.total_expense_nzd_cents,
      con.display_name,
      con.public_slug,
      ((public._latest_valid_consent_for_revision(v_story.id, r.id)).id is not null),
      not exists (
        select 1 from public.story_revision_media rm
        join public.story_media m on m.id = rm.media_id
        where rm.revision_id = r.id
          and not (
            (m.storage_backend = 'supabase' and m.approved_public_storage_path is not null and m.metadata_removed_at is not null)
            or (m.storage_backend = 'google_drive' and m.processing_state = 'promoted' and m.metadata_removed_at is not null)
          )
      ),
      c.attribution_type,
      c.attribution_value,
      c.confirmation_method,
      c.publication_confirmed_at,
      c.image_rights_confirmed_at,
      c.identifiable_people_state,
      coalesce(
        (
          select array_agg(distinct coalesce(rg.name, rl.custom_region_label) order by coalesce(rg.name, rl.custom_region_label))
          from public.story_revision_locations rl
          left join public.regions rg on rg.id = rl.region_id
          where rl.revision_id = r.id
        ),
        '{}'::text[]
      ),
      coalesce(
        (
          select array_agg(nm order by nm)
          from (
            select distinct coalesce(tg.name, rt.custom_label) as nm
            from public.story_revision_tags rt
            left join public.tags tg on tg.id = rt.tag_id
            where rt.revision_id = r.id
              and coalesce(tg.name, rt.custom_label) is not null
          ) as tag_names_src
        ),
        '{}'::text[]
      ),
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
    left join public.contributors con on con.id = v_story.contributor_id
    left join lateral (
      select pc.*
      from public.story_publication_consents pc
      where pc.revision_id = r.id
      order by pc.event_number desc
      limit 1
    ) c on true
    where r.id = p_revision_id;
end;
$$;

comment on function public.get_story_for_moderator(uuid) is
  'Moderator/admin only, keyed by REVISION id. Full publishable content + review context, unchanged from 20261007063355 except: region_names'' join is LEFT (20261015) so a custom-region location still appears in the claimed-regions list a moderator reviews, instead of silently vanishing.';

revoke execute on function public.get_story_for_moderator(uuid) from public, anon, authenticated;
grant execute on function public.get_story_for_moderator(uuid) to authenticated;

-- --------------------------------------------------------------------------
-- get_expense_aggregates()'s by_region breakdown is DELIBERATELY NOT
-- touched: it stays an inner join on public.regions, same as the region
-- FILTER (p_region_id) in list_published_stories() above stays curated-
-- only. A custom region label is free text a contributor typed once; it is
-- not a bucket other stories' custom labels can ever land in too (two
-- contributors typing "near Guangzhou" are not "the same region" the way
-- two choosing the curated Guangdong row are), so there is nothing
-- aggregatable to show, and the function already withholds any bucket
-- under its v_min_sample floor. No function body changes here.
-- --------------------------------------------------------------------------
