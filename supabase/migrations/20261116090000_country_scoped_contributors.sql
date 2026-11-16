-- Country-scoped contributor reads (2026-11-16).
--
-- Each country section is its own catalogue: a reader in /cn must never see
-- a New Zealand story, and vice versa (Engineering Rules 10 and 12). Stories
-- already were (list_published_stories / get_published_story take
-- p_country_slug), but the contributor directory and profile were not --
-- /cn/contributors listed every contributor with their NZ story count, and
-- a profile's "worked in" regions, trip years and tags came from every
-- country's stories.
--
-- contributor_public_facts() gains an optional p_country_id;
-- list_public_contributors() and get_public_contributor() gain an optional
-- p_country_slug. Omitted (null) => every country, exactly the old
-- behaviour, so the app code already deployed keeps working until the new
-- code that passes a country ships. An unknown or inactive slug returns no
-- rows, the same as list_published_stories().
--
-- The signatures change, so each function is dropped and re-created (a
-- second overload with a defaulted argument would make the one-argument
-- call ambiguous). A DROP takes comments and grants with it; both are
-- re-applied below. Bodies are otherwise byte-for-byte
-- 20261015063409_custom_region_labels.sql (facts) and
-- 20260914092352_contributor_facts_regions_zh_cn.sql (list/get).

drop function if exists public.list_public_contributors(text, uuid, integer);
drop function if exists public.get_public_contributor(text);
drop function if exists public.contributor_public_facts(uuid);

create function public.contributor_public_facts(
  p_contributor_id uuid,
  p_country_id uuid default null
)
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
      and (p_country_id is null or s.country_id = p_country_id)
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
comment on function public.contributor_public_facts(uuid, uuid) is
  'The single definition of "what is publicly true about this contributor" -- published story count plus regions/trip years/tags derived from ONLY their public, published, approved, consent-granted revisions (Engineering Rules 10 and 12), optionally within one country (p_country_id; null = every country, 20261116). Regions are jsonb objects carrying name and name_zh_cn; a custom region label renders with a null zh-CN twin. Tags resolve a curated tag name OR the contributor-typed custom_label. Internal: no grants, reachable only from the SECURITY DEFINER public RPCs.';

revoke all on function public.contributor_public_facts(uuid, uuid) from public, anon, authenticated;

create function public.list_public_contributors(
  p_cursor_display_name text default null,
  p_cursor_id uuid default null,
  p_limit integer default 20,
  p_country_slug text default null
)
returns table (
  contributor_id uuid,
  public_slug text,
  display_name text,
  bio text,
  avatar_emoji text,
  home_country_code text,
  published_story_count bigint,
  regions jsonb,
  trip_years smallint[],
  tags text[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_country_id uuid;
begin
  if p_country_slug is not null then
    select co.id into v_country_id from public.countries co where co.slug = p_country_slug and co.active = true;
    if v_country_id is null then
      return;
    end if;
  end if;

  return query
    select
      c.id, c.public_slug, c.display_name, c.bio, c.avatar_emoji,
      c.home_country_code, f.published_story_count, f.regions, f.trip_years,
      f.tags
    from public.contributors c
    join lateral public.contributor_public_facts(c.id, v_country_id) f on true
    where c.public_status = 'public'
      and c.public_slug is not null
      and c.attribution_type <> 'anonymous'
      and f.published_story_count > 0
      and (
        p_cursor_display_name is null
        or (lower(c.display_name), c.id) > (lower(p_cursor_display_name), p_cursor_id)
      )
    order by lower(c.display_name) asc, c.id asc
    limit v_limit;
end;
$$;
revoke execute on function public.list_public_contributors(text, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.list_public_contributors(text, uuid, integer, text) to anon, authenticated;

create function public.get_public_contributor(
  p_slug text,
  p_country_slug text default null
)
returns table (
  contributor_id uuid,
  public_slug text,
  display_name text,
  bio text,
  avatar_emoji text,
  home_country_code text,
  published_story_count bigint,
  regions jsonb,
  trip_years smallint[],
  tags text[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_country_id uuid;
begin
  if p_country_slug is not null then
    select co.id into v_country_id from public.countries co where co.slug = p_country_slug and co.active = true;
    if v_country_id is null then
      return;
    end if;
  end if;

  return query
    select
      c.id, c.public_slug, c.display_name, c.bio, c.avatar_emoji,
      c.home_country_code, f.published_story_count, f.regions, f.trip_years,
      f.tags
    from public.contributors c
    join lateral public.contributor_public_facts(c.id, v_country_id) f on true
    where c.public_slug = p_slug
      and c.public_status = 'public'
      and c.attribution_type <> 'anonymous'
      and f.published_story_count > 0;
end;
$$;
revoke execute on function public.get_public_contributor(text, text) from public, anon, authenticated;
grant execute on function public.get_public_contributor(text, text) to anon, authenticated;
