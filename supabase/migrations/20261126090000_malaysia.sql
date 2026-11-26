-- Malaysia: a third country section (owner decision 2026-11-26).
--
-- Framed like China (20261014085842): general first-person travel and living
-- stories, never Working Holiday wording. Unlike China it gets every New
-- Zealand feature, including the two that were New Zealand only in the
-- database until now:
--
-- * the contributor journey map (20261029091942) -- the map is now per
--   country: a country has a journey map when it carries journey bounds
--   (countries.journey_*), and a contributor's public journey is read one
--   country at a time, so a Malaysia profile never shows an NZ pin and an
--   NZ profile never shows a Malaysia pin (Rules 10, 12);
-- * the /costs aggregates (get_expense_aggregates) -- now take the country,
--   and only ever add up amounts recorded in that country's own currency
--   (amounts in different currencies are never banded, averaged or added).
--
-- Everything else a country needs was already data: regions, destinations,
-- tags, currency and every public read are scoped by country_id since
-- 20261014085842 / 20261121090000 / 20261121100000 / 20261116090000, so this
-- migration adds rows for those.
--
-- Defaults keep every existing caller's meaning: p_country_slug defaults to
-- 'new-zealand' wherever it is added, exactly as list_published_stories()
-- did, so the app running before this deploy keeps working against it.
--
-- No RLS or storage policy changes (Engineering Rule 21). Every function
-- re-created here keeps its previous grants.

-- --------------------------------------------------------------------------
-- The country
-- --------------------------------------------------------------------------

insert into public.countries (slug, code, name, name_zh_cn, currency_code)
values ('malaysia', 'my', 'Malaysia', '马来西亚', 'MYR')
on conflict (slug) do nothing;

-- --------------------------------------------------------------------------
-- Regions (13 states, 3 federal territories) and destinations (towns).
-- Reference/lookup data, not contributor content (Rule 22 is about seed
-- stories and people), seeded in a migration like China's.
-- --------------------------------------------------------------------------

insert into public.regions (slug, name, name_zh_cn, island_or_grouping, country_id)
select v.slug, v.name, v.name_zh_cn, v.grouping, c.id
from public.countries c
cross join (values
  ('kuala-lumpur',    'Kuala Lumpur',    '吉隆坡',   'Peninsular Malaysia'),
  ('selangor',        'Selangor',        '雪兰莪',   'Peninsular Malaysia'),
  ('putrajaya',       'Putrajaya',       '布城',     'Peninsular Malaysia'),
  ('penang',          'Penang',          '槟城',     'Peninsular Malaysia'),
  ('perak',           'Perak',           '霹雳',     'Peninsular Malaysia'),
  ('kedah',           'Kedah',           '吉打',     'Peninsular Malaysia'),
  ('perlis',          'Perlis',          '玻璃市',   'Peninsular Malaysia'),
  ('kelantan',        'Kelantan',        '吉兰丹',   'Peninsular Malaysia'),
  ('terengganu',      'Terengganu',      '登嘉楼',   'Peninsular Malaysia'),
  ('pahang',          'Pahang',          '彭亨',     'Peninsular Malaysia'),
  ('negeri-sembilan', 'Negeri Sembilan', '森美兰',   'Peninsular Malaysia'),
  ('melaka',          'Melaka',          '马六甲',   'Peninsular Malaysia'),
  ('johor',           'Johor',           '柔佛',     'Peninsular Malaysia'),
  ('sabah',           'Sabah',           '沙巴',     'East Malaysia (Borneo)'),
  ('sarawak',         'Sarawak',         '砂拉越',   'East Malaysia (Borneo)'),
  ('labuan',          'Labuan',          '纳闽',     'East Malaysia (Borneo)')
) as v (slug, name, name_zh_cn, grouping)
where c.slug = 'malaysia'
  and not exists (
    select 1 from public.regions r where r.slug = v.slug and r.country_id = c.id
  );

insert into public.destinations (region_id, slug, name, name_zh_cn)
select r.id, v.slug, v.name, v.name_zh_cn
from public.countries c
join public.regions r on r.country_id = c.id
join (values
  ('kuala-lumpur',    'kuala-lumpur-city', 'Kuala Lumpur',     '吉隆坡'),
  ('selangor',        'petaling-jaya',     'Petaling Jaya',    '八打灵再也'),
  ('selangor',        'shah-alam',         'Shah Alam',        '莎阿南'),
  ('selangor',        'subang-jaya',       'Subang Jaya',      '梳邦再也'),
  ('selangor',        'klang',             'Klang',            '巴生'),
  ('putrajaya',       'putrajaya-city',    'Putrajaya',        '布城'),
  ('penang',          'george-town',       'George Town',      '乔治市'),
  ('penang',          'butterworth',       'Butterworth',      '北海'),
  ('perak',           'ipoh',              'Ipoh',             '怡保'),
  ('perak',           'taiping',           'Taiping',          '太平'),
  ('perak',           'pangkor',           'Pangkor',          '邦咯岛'),
  ('kedah',           'langkawi',          'Langkawi',         '兰卡威'),
  ('kedah',           'alor-setar',        'Alor Setar',       '亚罗士打'),
  ('perlis',          'kangar',            'Kangar',           '加央'),
  ('kelantan',        'kota-bharu',        'Kota Bharu',       '哥打巴鲁'),
  ('terengganu',      'kuala-terengganu',  'Kuala Terengganu', '瓜拉登嘉楼'),
  ('terengganu',      'redang',            'Redang Island',    '热浪岛'),
  ('terengganu',      'perhentian',        'Perhentian Islands', '停泊岛'),
  ('pahang',          'kuantan',           'Kuantan',          '关丹'),
  ('pahang',          'cameron-highlands', 'Cameron Highlands', '金马伦高原'),
  ('pahang',          'genting-highlands', 'Genting Highlands', '云顶高原'),
  ('pahang',          'tioman',            'Tioman Island',    '刁曼岛'),
  ('negeri-sembilan', 'seremban',          'Seremban',         '芙蓉'),
  ('negeri-sembilan', 'port-dickson',      'Port Dickson',     '波德申'),
  ('melaka',          'melaka-city',       'Melaka City',      '马六甲市'),
  ('johor',           'johor-bahru',       'Johor Bahru',      '新山'),
  ('johor',           'batu-pahat',        'Batu Pahat',       '峇株巴辖'),
  ('johor',           'muar',              'Muar',             '麻坡'),
  ('sabah',           'kota-kinabalu',     'Kota Kinabalu',    '亚庇'),
  ('sabah',           'sandakan',          'Sandakan',         '山打根'),
  ('sabah',           'semporna',          'Semporna',         '仙本那'),
  ('sabah',           'tawau',             'Tawau',            '斗湖'),
  ('sarawak',         'kuching',           'Kuching',          '古晋'),
  ('sarawak',         'miri',              'Miri',             '美里'),
  ('sarawak',         'sibu',              'Sibu',             '诗巫'),
  ('sarawak',         'bintulu',           'Bintulu',          '民都鲁'),
  ('labuan',          'labuan-town',       'Labuan',           '纳闽')
) as v (region_slug, slug, name, name_zh_cn) on v.region_slug = r.slug
where c.slug = 'malaysia'
  and not exists (
    select 1 from public.destinations d where d.region_id = r.id and d.slug = v.slug
  );

-- --------------------------------------------------------------------------
-- Malaysia's tag set (general travel and living topics, never WHV).
-- --------------------------------------------------------------------------

insert into public.tags (slug, name, country_id)
select v.slug, v.name, c.id
from public.countries c
cross join (values
  -- Getting around
  ('public-transport',     'Public transport'),
  ('road-trip',            'Road trip'),
  ('ferries-and-islands',  'Ferries & islands'),
  ('domestic-flights',     'Domestic flights'),
  -- Practicalities
  ('cost-of-living',       'Cost of living'),
  ('renting',              'Renting'),
  ('weather-and-monsoon',  'Weather & monsoon'),
  ('staying-connected',    'Staying connected'),
  ('working-in-malaysia',  'Working in Malaysia'),
  ('studying',             'Studying'),
  -- Trip shape
  ('budget-travel',        'Budget travel'),
  ('solo-travel',          'Solo travel'),
  ('couple-travel',        'Couple travel'),
  ('family-travel',        'Family travel'),
  ('balik-kampung',        'Balik kampung'),
  ('hotels-and-homestays', 'Hotels & homestays'),
  -- What you do there
  ('food',                 'Food'),
  ('street-food',          'Street food'),
  ('cafes',                'Cafés'),
  ('festivals',            'Festivals'),
  ('heritage-towns',       'Heritage towns'),
  ('beaches-and-diving',   'Beaches & diving'),
  ('rainforest-and-hiking','Rainforest & hiking'),
  ('highlands',            'Highlands'),
  ('city-life',            'City life'),
  ('shopping',             'Shopping')
) as v (slug, name)
where c.slug = 'malaysia'
on conflict (country_id, slug) do nothing;

-- --------------------------------------------------------------------------
-- Journey map bounds per country. A country has a journey map exactly when
-- all four are set. The app's projection (lib/journey/geographies.ts) must
-- use the same numbers; this table is the enforcing copy.
-- --------------------------------------------------------------------------

alter table public.countries
  add column journey_min_latitude numeric(5, 2),
  add column journey_max_latitude numeric(5, 2),
  add column journey_min_longitude numeric(5, 2),
  add column journey_max_longitude numeric(5, 2),
  add constraint countries_journey_bounds_all_or_none check (
    (journey_min_latitude is null and journey_max_latitude is null
      and journey_min_longitude is null and journey_max_longitude is null)
    or (journey_min_latitude < journey_max_latitude
      and journey_min_longitude < journey_max_longitude)
  );

comment on column public.countries.journey_min_latitude is
  'Journey map bounds (with journey_max_latitude, journey_min_longitude, journey_max_longitude). All four set = this country has a journey map; pins must sit inside. Null = no journey map.';

update public.countries
  set journey_min_latitude = -47.5, journey_max_latitude = -34.0,
      journey_min_longitude = 166.0, journey_max_longitude = 178.9
  where slug = 'new-zealand';

update public.countries
  set journey_min_latitude = 0.8, journey_max_latitude = 7.5,
      journey_min_longitude = 99.5, journey_max_longitude = 119.5
  where slug = 'malaysia';

-- The pin bounds were NZ-only CHECKs on stories. They become a trigger that
-- reads the story's own country, so the database still refuses an
-- out-of-country pin whatever the writer.
alter table public.stories drop constraint stories_journey_latitude_nz;
alter table public.stories drop constraint stories_journey_longitude_nz;

create function public.stories_validate_journey_place()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_country public.countries;
begin
  if new.journey_latitude is null then
    return new;
  end if;

  select * into v_country from public.countries where id = new.country_id;

  if v_country.journey_min_latitude is null
     or new.journey_latitude not between v_country.journey_min_latitude and v_country.journey_max_latitude
     or new.journey_longitude not between v_country.journey_min_longitude and v_country.journey_max_longitude then
    raise exception 'journey pin is outside the story''s country' using errcode = 'WHV18';
  end if;

  return new;
end;
$$;

create trigger stories_validate_journey_place
  before insert or update of journey_latitude, journey_longitude, country_id on public.stories
  for each row
  execute function public.stories_validate_journey_place();

revoke execute on function public.stories_validate_journey_place() from public, anon, authenticated;

-- --------------------------------------------------------------------------
-- set_story_journey_place(): same contract, bounds from the story's country.
-- --------------------------------------------------------------------------
create or replace function public.set_story_journey_place(
  p_story_id uuid,
  p_label text,
  p_latitude numeric,
  p_longitude numeric
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_story public.stories;
  v_country public.countries;
  v_label text := left(btrim(coalesce(p_label, '')), 60);
  v_lat numeric := round(p_latitude, 2);
  v_lng numeric := round(p_longitude, 2);
begin
  if not coalesce(public._is_story_owner(p_story_id), false) then
    raise exception 'Story not found' using errcode = 'WHV11';
  end if;

  if p_latitude is null then
    update public.stories
      set journey_label = null, journey_latitude = null, journey_longitude = null
      where id = p_story_id;
    return;
  end if;

  select * into v_story from public.stories where id = p_story_id for update;
  if not found then
    raise exception 'Story not found' using errcode = 'WHV11';
  end if;

  if v_story.lifecycle_status <> 'published' or v_story.published_revision_id is null then
    raise exception 'Only published stories can be pinned on the journey map' using errcode = 'WHV15';
  end if;

  select * into v_country from public.countries where id = v_story.country_id;
  if v_country.journey_min_latitude is null then
    raise exception 'This story''s country has no journey map' using errcode = 'WHV17';
  end if;

  if v_label = '' then
    raise exception 'Give this place a name' using errcode = 'WHV18';
  end if;
  if p_longitude is null
     or v_lat not between v_country.journey_min_latitude and v_country.journey_max_latitude
     or v_lng not between v_country.journey_min_longitude and v_country.journey_max_longitude then
    raise exception 'The place must be inside the story''s country' using errcode = 'WHV18';
  end if;

  update public.stories
    set journey_label = v_label, journey_latitude = v_lat, journey_longitude = v_lng
    where id = p_story_id;
end;
$$;
comment on function public.set_story_journey_place(uuid, text, numeric, numeric) is
  'Owner only: pins a published story on the contributor''s journey map for the story''s own country (public immediately, no review), or clears the pin with a null latitude. Label trimmed and cut to 60; coordinates rounded to 2 dp and checked against countries.journey_* bounds (rejected, not clamped). Refusals: WHV11 not found/not yours, WHV15 not published, WHV17 country has no journey map, WHV18 bad label or out of bounds (all checked only when setting).';

-- --------------------------------------------------------------------------
-- get_my_journey(): appends country_slug; pinnable = published and the
-- country has a journey map. is_new_zealand kept for the deployed app.
-- --------------------------------------------------------------------------
drop function if exists public.get_my_journey();

create function public.get_my_journey()
returns table (
  id uuid,
  slug text,
  title text,
  lifecycle_status text,
  pinnable boolean,
  is_new_zealand boolean,
  parent_story_id uuid,
  journey_label text,
  journey_latitude numeric,
  journey_longitude numeric,
  trip_start_date date,
  country_slug text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.id,
    s.slug,
    coalesce(pr.title, dr.title),
    s.lifecycle_status,
    coalesce(
      s.lifecycle_status = 'published'
        and s.published_revision_id is not null
        and co.journey_min_latitude is not null,
      false),
    coalesce(co.slug = 'new-zealand', false),
    s.parent_story_id,
    s.journey_label,
    s.journey_latitude,
    s.journey_longitude,
    pr.trip_start_date,
    co.slug
  from public.stories s
  left join public.contributors c on c.id = s.contributor_id
  left join public.countries co on co.id = s.country_id
  left join public.story_revisions pr on pr.id = s.published_revision_id
  left join public.story_revisions dr on dr.id = s.current_draft_revision_id
  where (s.source_kind = 'self_submitted' and s.owner_user_id = auth.uid())
     or (s.source_kind = 'editorial_import' and c.linked_user_id = auth.uid())
  order by pr.trip_start_date asc nulls last, s.published_at asc nulls last, s.id;
$$;
comment on function public.get_my_journey() is
  'Owner-scoped, same ownership check as get_my_story_folders(): all of the caller''s own stories with their folder parent, journey pin and country slug. pinnable is true only for a published story whose country has a journey map. Ordered by the published revision''s trip_start_date, then published_at.';

revoke execute on function public.get_my_journey() from public, anon, authenticated;
grant execute on function public.get_my_journey() to authenticated;

-- --------------------------------------------------------------------------
-- get_published_contributor_journey(): one country at a time.
-- --------------------------------------------------------------------------
drop function if exists public.get_published_contributor_journey(uuid);

create function public.get_published_contributor_journey(
  p_contributor_id uuid,
  p_country_slug text default 'new-zealand'
)
returns table (
  story_id uuid,
  slug text,
  title text,
  excerpt text,
  parent_story_id uuid,
  journey_label text,
  journey_latitude numeric,
  journey_longitude numeric,
  trip_start_date date
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.id,
    s.slug,
    r.title,
    r.excerpt,
    (
      select p.id from public.stories p
      where p.id = s.parent_story_id
        and p.id <> s.id
        and p.contributor_id = s.contributor_id
        and p.country_id = s.country_id
        and p.journey_latitude is not null
        and public._story_is_publicly_visible(p.id)
    ),
    s.journey_label,
    s.journey_latitude,
    s.journey_longitude,
    r.trip_start_date
  from public.stories s
  join public.story_revisions r on r.id = s.published_revision_id
  join public.countries co on co.id = s.country_id and co.slug = p_country_slug
  where s.contributor_id = p_contributor_id
    and s.journey_latitude is not null
    and public._story_is_publicly_visible(s.id)
  order by r.trip_start_date asc nulls last, s.published_at asc, s.id
  limit 200;
$$;
comment on function public.get_published_contributor_journey(uuid, text) is
  'Public: one contributor''s journey map in one country (default new-zealand) -- every pinned, publicly visible story of that country ({story_id,slug,title,excerpt,parent_story_id,journey_label,journey_latitude,journey_longitude,trip_start_date}), trip order, max 200. parent_story_id only when that main story is also pinned, publicly visible and in the same country. Only the published revision is read.';

revoke execute on function public.get_published_contributor_journey(uuid, text) from public, anon, authenticated;
grant execute on function public.get_published_contributor_journey(uuid, text) to anon, authenticated;

-- --------------------------------------------------------------------------
-- get_expense_aggregates(): per country, in that country's own currency.
-- Body otherwise unchanged from 20261014085842.
-- --------------------------------------------------------------------------
drop function if exists public.get_expense_aggregates();

create function public.get_expense_aggregates(p_country_slug text default 'new-zealand')
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
  -- Below this many stories a bucket is withheld.
  v_min_sample constant integer := 5;
  -- Average Gregorian month, identical to lib/story/expense-per-month.ts.
  v_days_per_month constant numeric := 30.436875;
begin
  return query
  with published as (
    select s.id as story_id, r.id as revision_id,
           r.total_expense_nzd_cents as total_cents,
           r.trip_start_date, r.trip_end_date
    from public.stories s
    join public.countries co on co.id = s.country_id and co.slug = p_country_slug
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
      -- Never add up amounts in different currencies.
      and r.currency = co.currency_code
  ),
  with_total as (
    select * from published where total_cents is not null and total_cents > 0
  ),
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

comment on function public.get_expense_aggregates(text) is
  'Public: cost aggregates for one country (default new-zealand), over publicly visible published stories with granted consent, counting only amounts recorded in that country''s own currency. Buckets under 5 stories are withheld.';

revoke execute on function public.get_expense_aggregates(text) from public, anon, authenticated;
grant execute on function public.get_expense_aggregates(text) to anon, authenticated;
