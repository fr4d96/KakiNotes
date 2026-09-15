-- The contributor byline's "Regions" facts learn Simplified Chinese.
--
-- contributor_public_facts() returned `regions text[]` -- bare English names,
-- ordered A-Z -- and both public RPCs passed that column straight through,
-- so /contributors and /contributors/[slug] were the one reader-facing
-- surface 20260914150000 could not reach. `regions` becomes jsonb,
-- `[{"name": "Auckland", "name_zh_cn": "奥克兰"}, ...]`, the same
-- name-plus-translation shape every other public payload now carries, so
-- one TypeScript helper picks the language everywhere.
--
-- jsonb rather than a parallel `regions_zh_cn text[]`: two arrays that only
-- line up because their subqueries share an ORDER BY are the kind of
-- invariant that survives until someone edits one of them. An object per
-- region cannot come apart. It also means a caller that still expects
-- `string[]` fails TYPECHECK after `npm run supabase:types:linked`, not at
-- runtime as "[object Object]".
--
-- Order is unchanged -- by the ENGLISH name, whichever language the reader
-- uses -- because the same contributor's facts should list in the same
-- order for every visitor; the phase-1 status entry made the same call for
-- /costs.
--
-- DROP + CREATE for all three: the OUT type of `regions` changes, and
-- Postgres refuses CREATE OR REPLACE when a return type changes. The two
-- callers are dropped FIRST -- their return tables carry the same column.
-- A DROP takes comments and grants with it, so the facts comment
-- (20260910091000's wording) and every revoke/grant pair are re-applied
-- below, the trap 20260909130000 and 20260910090000 both document. The
-- bodies are otherwise the LIVE definitions (pg_get_functiondef) verbatim.

drop function if exists public.get_public_contributor(text);
drop function if exists public.list_public_contributors(text, uuid, integer);
drop function if exists public.contributor_public_facts(uuid);

create function public.contributor_public_facts(p_contributor_id uuid)
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
      -- Inner join is correct here and only here: region_id is NOT NULL.
      -- DISTINCT over the region row's (name, name_zh_cn) pair, which is
      -- one pair per region, then one object per pair in English order.
      select coalesce(
        jsonb_agg(jsonb_build_object('name', x.name, 'name_zh_cn', x.name_zh_cn) order by x.name),
        '[]'::jsonb
      )
      from (
        select distinct reg.name, reg.name_zh_cn
        from published pub
        join public.story_revision_locations loc on loc.revision_id = pub.revision_id
        join public.regions reg on reg.id = loc.region_id
      ) x
    ),
    (
      select coalesce(array_agg(distinct pub.trip_year order by pub.trip_year desc), '{}'::smallint[])
      from published pub
      where pub.trip_year is not null
    ),
    (
      -- LEFT join + coalesce, the pattern 20260812110000 and 20260903120000
      -- already established: a row is either a curated tag reference or a
      -- contributor-typed label. Names are resolved without filtering on
      -- tags.active, matching 20260816100200's rule that a retired tag still
      -- renders rather than vanishing from a story that genuinely carried
      -- it. The WHERE keeps a row carrying neither out of the array, so a
      -- malformed row can never render as a blank chip.
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
  'The single definition of "what is publicly true about this contributor" -- published story count plus regions/trip years/tags derived from ONLY their public, published, approved, consent-granted revisions (Engineering Rules 10 and 12). Regions are jsonb objects carrying name and name_zh_cn (20260914150100). Tags resolve a curated tag name OR the contributor-typed custom_label, per the LEFT-JOIN-and-coalesce rule public reads have used since 20260812110000. Internal: no grants, reachable only from the SECURITY DEFINER public RPCs.';

revoke all on function public.contributor_public_facts(uuid) from public, anon, authenticated;

create function public.get_public_contributor(p_slug text)
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
begin
  return query
    select
      c.id, c.public_slug, c.display_name, c.bio, c.avatar_emoji,
      c.home_country_code, f.published_story_count, f.regions, f.trip_years,
      f.tags
    from public.contributors c
    join lateral public.contributor_public_facts(c.id) f on true
    where c.public_slug = p_slug
      and c.public_status = 'public'
      and c.attribution_type <> 'anonymous'
      and f.published_story_count > 0;
end;
$$;

revoke execute on function public.get_public_contributor(text) from public, anon, authenticated;
grant execute on function public.get_public_contributor(text) to anon, authenticated;

create function public.list_public_contributors(
  p_cursor_display_name text default null,
  p_cursor_id uuid default null,
  p_limit integer default 20
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
begin
  return query
    select
      c.id, c.public_slug, c.display_name, c.bio, c.avatar_emoji,
      c.home_country_code, f.published_story_count, f.regions, f.trip_years,
      f.tags
    from public.contributors c
    join lateral public.contributor_public_facts(c.id) f on true
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

revoke execute on function public.list_public_contributors(text, uuid, integer) from public, anon, authenticated;
grant execute on function public.list_public_contributors(text, uuid, integer) to anon, authenticated;
