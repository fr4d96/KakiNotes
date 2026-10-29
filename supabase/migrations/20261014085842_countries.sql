-- Second country section (China, general first-person travel stories,
-- framed separately from New Zealand's WHV framing -- product decision
-- recorded in docs/product-spec.md and docs/implementation-status.md).
--
-- Builds on 20260924021909_countries.sql (the `countries` lookup table and
-- `regions.country_id`): adds China as a second active country, and gives
-- `stories` a non-null `country_id`, backfilled to New Zealand so every
-- existing row keeps meaning exactly what it already meant. A new
-- trigger enforces that a story's selected regions always belong to the
-- story's own country (Engineering Rule 10/12: a /cn page must never surface
-- an NZ story or region and vice versa) -- the same "can't be a plain CHECK,
-- so it's a trigger" shape `story_revision_locations_validate_destination`
-- already uses for region/destination consistency.

-- --------------------------------------------------------------------------
-- countries: the table, its RLS, the New Zealand row and regions.country_id
-- already exist (20260924021909_countries.sql). This migration only adds the
-- second row.
-- --------------------------------------------------------------------------

insert into public.countries (slug, code, name, name_zh_cn)
values ('china', 'cn', 'China', '中国')
on conflict (slug) do nothing;

-- --------------------------------------------------------------------------
-- stories.country_id (backfilled to New Zealand, then locked NOT NULL)
-- --------------------------------------------------------------------------

alter table public.stories add column country_id uuid references public.countries (id) on delete restrict;

update public.stories set country_id = (select id from public.countries where slug = 'new-zealand')
  where country_id is null;

alter table public.stories alter column country_id set not null;
create index stories_country_id_idx on public.stories (country_id);

-- --------------------------------------------------------------------------
-- Cross-table integrity: a story's selected region must belong to the
-- story's own country. Can't be a plain CHECK (needs a join across
-- story_revision_locations -> story_revisions -> stories -> regions), so a
-- trigger, same shape as story_revision_locations_validate_destination.
-- --------------------------------------------------------------------------

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

create trigger story_revision_locations_validate_country
  before insert or update on public.story_revision_locations
  for each row
  execute function public.story_revision_locations_validate_country();

-- Trigger-only: never callable through /rest/v1/rpc. (Postgres checks EXECUTE
-- when the trigger is created, not each time it fires.)
revoke execute on function public.story_revision_locations_validate_country() from public, anon, authenticated;

-- --------------------------------------------------------------------------
-- Seed China reference data (regions = provinces/municipalities,
-- destinations = cities). Reference/lookup data, not contributor content --
-- fine to seed in a migration rather than supabase/seed.sql, same as the
-- original lookup_tables.sql did for NZ regions in later migrations.
-- --------------------------------------------------------------------------

do $$
declare
  v_china_id uuid;
  v_guangdong_id uuid;
  v_beijing_id uuid;
  v_shanghai_id uuid;
  v_sichuan_id uuid;
  v_yunnan_id uuid;
begin
  select id into v_china_id from public.countries where slug = 'china';

  insert into public.regions (slug, name, name_zh_cn, island_or_grouping, country_id) values
    ('guangdong', 'Guangdong', '广东', null, v_china_id),
    ('beijing-municipality', 'Beijing', '北京', null, v_china_id),
    ('shanghai-municipality', 'Shanghai', '上海', null, v_china_id),
    ('sichuan', 'Sichuan', '四川', null, v_china_id),
    ('yunnan', 'Yunnan', '云南', null, v_china_id);

  select id into v_guangdong_id from public.regions where slug = 'guangdong' and country_id = v_china_id;
  select id into v_beijing_id from public.regions where slug = 'beijing-municipality' and country_id = v_china_id;
  select id into v_shanghai_id from public.regions where slug = 'shanghai-municipality' and country_id = v_china_id;
  select id into v_sichuan_id from public.regions where slug = 'sichuan' and country_id = v_china_id;
  select id into v_yunnan_id from public.regions where slug = 'yunnan' and country_id = v_china_id;

  insert into public.destinations (region_id, slug, name, name_zh_cn) values
    (v_guangdong_id, 'guangzhou', 'Guangzhou', '广州'),
    (v_guangdong_id, 'shenzhen', 'Shenzhen', '深圳'),
    (v_guangdong_id, 'foshan', 'Foshan', '佛山'),
    (v_guangdong_id, 'dongguan', 'Dongguan', '东莞'),
    (v_guangdong_id, 'zhuhai', 'Zhuhai', '珠海'),
    (v_beijing_id, 'beijing', 'Beijing', '北京'),
    (v_shanghai_id, 'shanghai', 'Shanghai', '上海'),
    (v_sichuan_id, 'chengdu', 'Chengdu', '成都'),
    (v_yunnan_id, 'kunming', 'Kunming', '昆明'),
    (v_yunnan_id, 'lijiang', 'Lijiang', '丽江');
end;
$$;

-- --------------------------------------------------------------------------
-- Public RPC changes: country-scoped reads
-- --------------------------------------------------------------------------

-- list_published_stories(): append p_country_slug, default 'new-zealand' so
-- every existing caller (which predates countries entirely) keeps returning
-- exactly what it returned before this migration. Callers added for /cn
-- pass p_country_slug => 'china' explicitly -- see lib/story/public-queries.ts.
drop function if exists public.list_published_stories(
  timestamptz, uuid, integer, uuid, uuid, uuid, uuid, smallint, text, uuid, text, boolean, uuid, text
);

create function public.list_published_stories(
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
          'region_name', reg.name,
          'region_name_zh_cn', reg.name_zh_cn,
          'destination_name', coalesce(dest.name, loc.custom_destination_label),
          'destination_name_zh_cn', dest.name_zh_cn
        ) order by loc.sort_order), '[]'::jsonb)
        from public.story_revision_locations loc
        join public.regions reg on reg.id = loc.region_id
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

-- get_published_story(): append p_country_slug (default null = no filter,
-- preserving every existing call site's behaviour) and a country_slug output
-- column, via CREATE OR REPLACE (legal -- new trailing defaulted parameter,
-- new trailing output column, same resolution for every existing call).
-- Everything else below is byte-for-byte the live
-- 20260914092322_vocab_name_zh_cn.sql definition. When p_country_slug is
-- given, a story whose country does not match returns no rows, same as an
-- unknown slug -- so /cn/stories/[id] can never render an NZ story by slug
-- guessing, and vice versa (Engineering Rule 12).
-- Drop the old one-arg overload first: CREATE OR REPLACE with a different
-- argument list creates a second overload, and get_published_story(p_slug => ..)
-- would then fail with "function is not unique".
drop function if exists public.get_published_story(text);

create function public.get_published_story(p_slug text, p_country_slug text default null)
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
          'region_name', reg.name,
          'region_name_zh_cn', reg.name_zh_cn,
          'destination_name', coalesce(dest.name, loc.custom_destination_label),
          'destination_name_zh_cn', dest.name_zh_cn
        ) order by loc.sort_order), '[]'::jsonb)
        from public.story_revision_locations loc
        join public.regions reg on reg.id = loc.region_id
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
  'Public, anon-readable. Same invariants as before this migration, plus an optional p_country_slug: when provided, a story whose country does not match returns no rows, same as an unknown slug. Appends country_slug to the result so callers can display/validate without a second lookup.';

revoke execute on function public.get_published_story(text, text) from public, anon, authenticated;
grant execute on function public.get_published_story(text, text) to anon, authenticated;

-- create_self_service_draft(): append p_country_slug as a new trailing
-- parameter with a 'new-zealand' default, via CREATE OR REPLACE (legal in
-- Postgres when only adding trailing defaulted parameters -- no signature
-- break, so every existing call site keeps resolving unchanged). Body is
-- otherwise byte-for-byte the live 20260803090700_story_lifecycle_functions.sql
-- definition, plus country_id on the stories insert and the unknown-country
-- guard.
-- Same overload hazard as get_published_story: drop the 9-arg version first.
drop function if exists public.create_self_service_draft(
  text, text, jsonb, date, date, smallint, text, integer, text
);

create function public.create_self_service_draft(
  p_title text,
  p_excerpt text default null,
  p_content_json jsonb default '[]'::jsonb,
  p_trip_start_date date default null,
  p_trip_end_date date default null,
  p_trip_year smallint default null,
  p_travel_style text default null,
  p_total_expense_nzd_cents integer default null,
  p_contributor_note text default null,
  p_country_slug text default 'new-zealand'
)
returns table (story_id uuid, revision_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contributor_id uuid;
  v_country_id uuid;
  v_story_id uuid;
  v_revision_id uuid;
begin
  select id into v_contributor_id from public.contributors where linked_user_id = auth.uid();
  if v_contributor_id is null then
    raise exception 'You must set up your contributor identity before creating a story';
  end if;

  select co.id into v_country_id from public.countries co where co.slug = p_country_slug and co.active = true;
  if v_country_id is null then
    raise exception 'Unknown country: %', p_country_slug;
  end if;

  insert into public.stories (contributor_id, owner_user_id, source_kind, slug, created_by, country_id)
  values (v_contributor_id, auth.uid(), 'self_submitted', public._generate_story_slug(p_title), auth.uid(), v_country_id)
  returning id into v_story_id;

  insert into public.story_revisions (
    story_id, revision_number, title, excerpt, content_json, trip_start_date, trip_end_date,
    trip_year, travel_style, total_expense_nzd_cents, contributor_note, created_by, updated_by
  )
  values (
    v_story_id, 1, p_title, p_excerpt, coalesce(p_content_json, '[]'::jsonb), p_trip_start_date,
    p_trip_end_date, p_trip_year, p_travel_style, p_total_expense_nzd_cents, p_contributor_note,
    auth.uid(), auth.uid()
  )
  returning id into v_revision_id;

  update public.stories set current_draft_revision_id = v_revision_id where id = v_story_id;

  return query select v_story_id, v_revision_id;
end;
$$;

comment on function public.create_self_service_draft(text, text, jsonb, date, date, smallint, text, integer, text, text) is
  'Creates the story-shell + first draft revision a contributor edits from. p_country_slug defaults to new-zealand (unchanged historical behaviour); the "new story" form passes the contributor''s chosen country explicitly once China ships. Region selections on this story are enforced by story_revision_locations_validate_country() to belong to the same country.';

revoke execute on function public.create_self_service_draft(
  text, text, jsonb, date, date, smallint, text, integer, text, text
) from public, anon, authenticated;
grant execute on function public.create_self_service_draft(
  text, text, jsonb, date, date, smallint, text, integer, text, text
) to authenticated;

-- --------------------------------------------------------------------------
-- get_story_country(): new, additive-only RPC so the authoring UI can filter
-- its region/destination picker to the story's own country (product
-- decision 4: "the region picker only shows that country's regions").
-- Owner/linked-contributor or editor/admin only -- same authorization shape
-- as every other story-scoped reader in this domain, reusing
-- _is_story_owner() (20260804092200_source_kind_partitioned_authorization.sql)
-- rather than re-deriving it.
-- --------------------------------------------------------------------------

create function public.get_story_country(p_story_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_slug text;
begin
  if not (
    public._is_story_owner(p_story_id)
    or public.has_role(auth.uid(), 'editor')
    or public.has_role(auth.uid(), 'admin')
  ) then
    return null;
  end if;

  select c.slug into v_slug
  from public.stories s
  join public.countries c on c.id = s.country_id
  where s.id = p_story_id;

  return v_slug;
end;
$$;

comment on function public.get_story_country(uuid) is
  'Returns the slug of a story''s country for the owner/linked contributor or editor/admin, null otherwise (never raises -- same "quiet null" shape as other authoring readers). Used to scope the region/destination picker in the authoring UI to the story''s own country.';

revoke execute on function public.get_story_country(uuid) from public, anon, authenticated;
grant execute on function public.get_story_country(uuid) to authenticated;

-- --------------------------------------------------------------------------
-- get_expense_aggregates(): NZ-only. The /costs page reports NZD working-
-- holiday figures; China travel stories must not be mixed into them. Body is
-- otherwise the 20260914092322_vocab_name_zh_cn.sql definition. A
-- country-aware /cn/costs is a follow-up (currency decision pending).
-- --------------------------------------------------------------------------

create or replace function public.get_expense_aggregates()
returns table (
  overall jsonb,
  per_month jsonb,
  by_region jsonb,
  by_category jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  -- Below this many stories a bucket is withheld. See the header.
  v_min_sample constant integer := 5;
  -- Average Gregorian month, identical to lib/story/expense-per-month.ts, so
  -- a per-month figure here and one on a story page cannot disagree.
  v_days_per_month constant numeric := 30.436875;
begin
  return query
  with published as (
    select s.id as story_id, r.id as revision_id,
           r.total_expense_nzd_cents as total_cents,
           r.trip_start_date, r.trip_end_date
    from public.stories s
    join public.story_revisions r
      on r.id = s.published_revision_id and r.story_id = s.id and r.revision_status = 'approved'
    join lateral (
      select * from public.story_publication_consents
      where story_id = s.id and revision_id = s.published_revision_id and consent_status = 'granted'
      limit 1
    ) con on true
    where s.visibility = 'public'
      and s.lifecycle_status = 'published'
      and s.consent_revoked_at is null
      and s.country_id = (select co.id from public.countries co where co.slug = 'new-zealand')
  ),
  with_total as (
    select * from published where total_cents is not null and total_cents > 0
  ),
  -- Only trips with a real range, and long enough for a monthly figure to
  -- describe something the contributor lived through -- the same 28-day floor
  -- lib/story/expense-per-month.ts applies, for the same reason: $3,000 over
  -- 10 days is not "$9,132 a month".
  with_months as (
    select total_cents,
           (trip_end_date - trip_start_date + 1) as days
    from with_total
    where trip_start_date is not null
      and trip_end_date is not null
      and trip_end_date >= trip_start_date
      and (trip_end_date - trip_start_date + 1) >= 28
  )
  select
    (
      select case when count(*) >= v_min_sample then jsonb_build_object(
        'story_count', count(*),
        'median_cents', round(percentile_cont(0.5) within group (order by total_cents))::bigint,
        'p25_cents', round(percentile_cont(0.25) within group (order by total_cents))::bigint,
        'p75_cents', round(percentile_cont(0.75) within group (order by total_cents))::bigint
      ) else null end
      from with_total
    ),
    (
      select case when count(*) >= v_min_sample then jsonb_build_object(
        'story_count', count(*),
        'median_cents', round(percentile_cont(0.5) within group (
          order by total_cents / (days / v_days_per_month)))::bigint,
        'p25_cents', round(percentile_cont(0.25) within group (
          order by total_cents / (days / v_days_per_month)))::bigint,
        'p75_cents', round(percentile_cont(0.75) within group (
          order by total_cents / (days / v_days_per_month)))::bigint
      ) else null end
      from with_months
    ),
    (
      select coalesce(jsonb_agg(b order by b->>'region_name'), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'region_name', reg.name,
          'region_name_zh_cn', reg.name_zh_cn,
          'story_count', count(distinct wt.story_id),
          'median_cents', round(percentile_cont(0.5) within group (order by wt.total_cents))::bigint
        ) as b
        from with_total wt
        join public.story_revision_locations loc on loc.revision_id = wt.revision_id
        join public.regions reg on reg.id = loc.region_id
        group by reg.id, reg.name, reg.name_zh_cn
        having count(distinct wt.story_id) >= v_min_sample
      ) region_rows
    ),
    (
      select coalesce(jsonb_agg(b order by (b->>'story_count')::int desc, b->>'name'), '[]'::jsonb)
      from (
        -- Case-folded key so "Van" and "van" are one bucket. Contributors can
        -- type their own categories (20260903110000), which fragments this cut
        -- by design -- an accepted cost of that decision, and the reason the
        -- curated rows still exist as suggestions.
        select jsonb_build_object(
          'name', min(coalesce(ec.name, e.custom_label)),
          'name_zh_cn', min(ec.name_zh_cn),
          'story_count', count(distinct wt.story_id),
          'median_cents', round(percentile_cont(0.5) within group (order by e.amount_nzd_cents))::bigint
        ) as b
        from published wt
        join public.story_revision_expenses e on e.revision_id = wt.revision_id
        left join public.expense_categories ec on ec.id = e.category_id
        where e.amount_nzd_cents > 0
        group by lower(coalesce(ec.name, e.custom_label))
        having count(distinct wt.story_id) >= v_min_sample
      ) category_rows
    );
end;
$$;
