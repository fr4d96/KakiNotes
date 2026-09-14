-- Simplified Chinese names for the closed vocabularies, as DATA beside the
-- English name: `name_zh_cn` on regions, destinations and expense_categories.
--
-- Phase 1 of the language work (2026-09-14, lib/i18n/vocab.ts) translated
-- these by SLUG from messages/zh-CN.json, and could only reach the surfaces
-- that read the tables directly -- the /stories filters and the authoring
-- pickers. The public RPCs build their JSON as `'region_name', reg.name`
-- with no slug beside it, so story cards, the story page's place list, the
-- contributor byline's regions row and /costs' by-region and by-category
-- lists all stayed English in Chinese mode. That overlay is deleted with
-- this migration; the column is the proper home the phase-1 entry named.
--
-- ONE column, not a jsonb map of locales: the product has exactly two
-- languages (Malaysia's WHV market reads Simplified Chinese), and a typed
-- nullable text column is honest about that and trivially typed in
-- types/database.ts. A third language is a second column and a re-run of
-- this pattern, which is a fine price for not carrying an untyped map.
--
-- The RPCs emit BOTH names and take NO locale parameter, on purpose. Their
-- output stays identical whichever language the visitor reads, which is
-- what lets lib/story/public-queries.ts keep caching `list_published_stories`
-- results under a key with no locale in it (2026-09-14, the ISR trade). The
-- pick happens in TypeScript (lib/i18n/vocab.ts, `vocabName()`), falling
-- back to `name` whenever `name_zh_cn` is null -- a row seeded after this
-- backfill, or a contributor-typed label, which is never translated.
--
-- `work_types` is left alone: retired as a taxonomy on 2026-08-16
-- (20260816100100), never shown in the UI, and its RPC payload keeps its
-- flat-string shape untouched.
--
-- NULL for a contributor-typed label, always. `destination_name` is
-- `coalesce(dest.name, loc.custom_destination_label)` and an expense's
-- `name` is `coalesce(ec.name, e.custom_label)`; the `_zh_cn` twin reads
-- ONLY the curated table, so a typed label arrives with `null` beside it
-- and renders as typed. Translating what a contributor wrote would be
-- putting words in their mouth (CLAUDE.md product context).
--
-- Four functions, all CREATE OR REPLACE: every one keeps its signature
-- because the new keys live inside jsonb columns that already existed.
-- Grants are re-applied anyway -- CREATE OR REPLACE preserves them, but the
-- explicit revoke/grant pair is what every prior migration of these
-- functions carries, and the cost of repeating it is zero. Bodies are the
-- LIVE definitions (pg_get_functiondef), verified by hashing each
-- whitespace-stripped body with the added lines removed against the
-- database's own -- the transcription check 20260910120000 established.

-- --------------------------------------------------------------------------
-- Columns
-- --------------------------------------------------------------------------

alter table public.regions add column name_zh_cn text;
alter table public.regions add constraint regions_name_zh_cn_length
  check (name_zh_cn is null or char_length(name_zh_cn) between 1 and 120);
comment on column public.regions.name_zh_cn is
  'Simplified Chinese display name. Null means "show `name`"; the app never invents a translation.';

alter table public.destinations add column name_zh_cn text;
alter table public.destinations add constraint destinations_name_zh_cn_length
  check (name_zh_cn is null or char_length(name_zh_cn) between 1 and 120);
comment on column public.destinations.name_zh_cn is
  'Simplified Chinese display name. Null means "show `name`"; the app never invents a translation.';

alter table public.expense_categories add column name_zh_cn text;
alter table public.expense_categories add constraint expense_categories_name_zh_cn_length
  check (name_zh_cn is null or char_length(name_zh_cn) between 1 and 120);
comment on column public.expense_categories.name_zh_cn is
  'Simplified Chinese display name. Null means "show `name`"; the app never invents a translation.';

-- --------------------------------------------------------------------------
-- Backfill. Regions and expense categories reuse the phase-1 strings from
-- messages/zh-CN.json verbatim, so nothing a Chinese reader already saw in
-- the /stories filters changes wording. Destinations are new: standard
-- Simplified Chinese renderings of the New Zealand place names, matched on
-- (region slug, destination slug) because a destination slug is only unique
-- within its region.
-- --------------------------------------------------------------------------

update public.regions r
set name_zh_cn = v.zh
from (values
  ('northland', '北地大区'),
  ('auckland', '奥克兰'),
  ('waikato', '怀卡托'),
  ('bay-of-plenty', '丰盛湾'),
  ('gisborne', '吉斯伯恩'),
  ('hawkes-bay', '霍克斯湾'),
  ('taranaki', '塔拉纳基'),
  ('manawatu-whanganui', '马纳瓦图-旺加努伊'),
  ('wellington', '惠灵顿'),
  ('tasman', '塔斯曼'),
  ('nelson', '尼尔森'),
  ('marlborough', '马尔堡'),
  ('west-coast', '西海岸'),
  ('canterbury', '坎特伯雷'),
  ('otago', '奥塔哥'),
  ('southland', '南地大区')
) as v(slug, zh)
where r.slug = v.slug;

update public.destinations d
set name_zh_cn = v.zh
from (values
  ('auckland', 'auckland-city', '奥克兰市'),
  ('auckland', 'waiheke-island', '怀赫科岛'),
  ('bay-of-plenty', 'rotorua', '罗托鲁瓦'),
  ('bay-of-plenty', 'tauranga', '陶朗加'),
  ('bay-of-plenty', 'whakatane', '瓦卡塔尼'),
  ('canterbury', 'christchurch', '基督城'),
  ('canterbury', 'methven', '梅斯文'),
  ('gisborne', 'gisborne-city', '吉斯伯恩'),
  ('hawkes-bay', 'hastings', '黑斯廷斯'),
  ('hawkes-bay', 'napier', '纳皮尔'),
  ('manawatu-whanganui', 'palmerston-north', '北帕默斯顿'),
  ('manawatu-whanganui', 'whanganui', '旺加努伊'),
  ('marlborough', 'blenheim', '布莱尼姆'),
  ('marlborough', 'picton', '皮克顿'),
  ('nelson', 'nelson-city', '尼尔森'),
  ('northland', 'bay-of-islands', '岛屿湾'),
  ('northland', 'kerikeri', '凯里凯里'),
  ('northland', 'whangarei', '旺阿雷'),
  ('otago', 'dunedin', '达尼丁'),
  ('otago', 'queenstown', '皇后镇'),
  ('otago', 'wanaka', '瓦纳卡'),
  ('southland', 'invercargill', '因弗卡吉尔'),
  ('southland', 'te-anau', '蒂阿瑙'),
  ('taranaki', 'new-plymouth', '新普利茅斯'),
  ('tasman', 'golden-bay', '黄金湾'),
  ('tasman', 'motueka', '莫图伊卡'),
  ('waikato', 'cambridge', '剑桥'),
  ('waikato', 'hamilton', '汉密尔顿'),
  ('waikato', 'raglan', '拉格伦'),
  ('wellington', 'lower-hutt', '下哈特'),
  ('wellington', 'wellington-city', '惠灵顿市'),
  ('west-coast', 'franz-josef', '弗朗茨约瑟夫'),
  ('west-coast', 'greymouth', '格雷茅斯'),
  ('west-coast', 'hokitika', '霍基蒂卡')
) as v(region_slug, slug, zh)
join public.regions r on r.slug = v.region_slug
where d.region_id = r.id and d.slug = v.slug;

update public.expense_categories ec
set name_zh_cn = v.zh
from (values
  ('flights', '机票'),
  ('visa-fee', '签证费'),
  ('insurance', '保险'),
  ('first-month-rent', '第一个月房租'),
  ('bond', '押金'),
  ('vehicle', '交通工具'),
  ('gear', '装备'),
  ('food', '饮食'),
  ('transport', '交通'),
  ('activities', '活动'),
  ('other', '其他')
) as v(slug, zh)
where ec.slug = v.slug;

-- --------------------------------------------------------------------------
-- list_published_stories(): `regions` entries gain region_name_zh_cn and
-- destination_name_zh_cn. No new join -- both rows were already in hand.
-- --------------------------------------------------------------------------

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
  p_search text default null
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
  tags jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_query tsquery;
begin
  if p_cost_band is not null and p_cost_band not in ('under_5k', '5k_15k', '15k_30k', '30k_plus') then
    raise exception 'Invalid cost band: %', p_cost_band;
  end if;

  if p_search is not null and length(trim(p_search)) > 0 then
    v_query := websearch_to_tsquery('simple', p_search);
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
  timestamptz, uuid, integer, uuid, uuid, uuid, uuid, smallint, text, uuid,
  text, boolean, uuid, text
) from public, anon, authenticated;
grant execute on function public.list_published_stories(
  timestamptz, uuid, integer, uuid, uuid, uuid, uuid, smallint, text, uuid,
  text, boolean, uuid, text
) to anon, authenticated;

-- --------------------------------------------------------------------------
-- get_published_story(): the same two keys on `regions`, and name_zh_cn on
-- each `expenses` row (null for a contributor-typed category).
-- --------------------------------------------------------------------------

create or replace function public.get_published_story(p_slug text)
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
  expenses jsonb
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
begin
  select st.* into v_story from public.stories st
    where st.slug = p_slug and st.visibility = 'public' and st.lifecycle_status = 'published';
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
      -- The optional per-category breakdown behind the headline
      -- total_expense_nzd_cents above. Read from the PUBLISHED revision
      -- (r.id is v_story.published_revision_id, checked approved and
      -- consented above), so a draft edit to someone's budget can never
      -- appear here -- Engineering Rules 10 and 12 hold by construction
      -- rather than by a filter that could be forgotten.
      --
      -- LEFT join and coalesce, matching work_types/tags directly above: a
      -- row is either a curated expense_categories reference or a
      -- contributor-typed label (20260903110000), and an inner join would
      -- silently drop every typed one.
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
      )
    from public.story_revisions r
    where r.id = v_story.published_revision_id;
end;
$$;

revoke execute on function public.get_published_story(text) from public, anon, authenticated;
grant execute on function public.get_published_story(text) to anon, authenticated;

-- --------------------------------------------------------------------------
-- get_expense_aggregates(): region_name_zh_cn on by_region rows (reg.id is
-- the group key, so the extra column is functionally dependent; it is
-- listed in the GROUP BY anyway for clarity) and name_zh_cn on by_category
-- rows. min() over a group of one curated category is that category's
-- translation; over a group of typed labels it is null, as intended.
-- Ordering stays on the English keys, so the row order a visitor sees does
-- not change with their language.
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

revoke execute on function public.get_expense_aggregates() from public, anon, authenticated;
grant execute on function public.get_expense_aggregates() to anon, authenticated;

-- --------------------------------------------------------------------------
-- list_my_stories(): the contributor's own cards, same two keys on `regions`.
-- This one has no custom_destination_label coalesce (it never did), so
-- destination_name_zh_cn is simply the curated row's translation or null.
-- --------------------------------------------------------------------------

create or replace function public.list_my_stories()
returns table (
  id uuid,
  slug text,
  source_kind public.story_source_kind,
  visibility public.story_visibility,
  lifecycle_status public.story_lifecycle_status,
  current_draft_revision_id uuid,
  published_revision_id uuid,
  version integer,
  submitted_at timestamptz,
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  title text,
  excerpt text,
  regions jsonb,
  cover_media_id uuid,
  cover_alt_text text,
  draft_revision_status public.story_revision_status,
  tags jsonb
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
             'region_name', reg.name, 'region_name_zh_cn', reg.name_zh_cn,
             'destination_name', dest.name, 'destination_name_zh_cn', dest.name_zh_cn
           ) order by loc.sort_order), '[]'::jsonb)
           from public.story_revision_locations loc
           join public.regions reg on reg.id = loc.region_id
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
         )
  from public.stories s
  left join public.contributors c on c.id = s.contributor_id
  left join public.story_revisions r on r.id = coalesce(s.current_draft_revision_id, s.published_revision_id)
  left join public.story_revisions dr on dr.id = s.current_draft_revision_id
  where (s.source_kind = 'self_submitted' and s.owner_user_id = auth.uid())
     or (s.source_kind = 'editorial_import' and c.linked_user_id = auth.uid())
  order by s.updated_at desc;
$$;

revoke execute on function public.list_my_stories() from public, anon, authenticated;
grant execute on function public.list_my_stories() to authenticated;
