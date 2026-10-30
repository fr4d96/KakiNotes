-- Keyword search for list_published_stories() (2026-10-30).
--
-- Before: websearch_to_tsquery over title + excerpt only, whole words only.
-- Typing "kiw" (search-as-you-type) found nothing until "kiwi" was
-- finished, "supermarket" missed "Supermarkets", and a story's text, tags
-- and places were never searched ("cheap food" found 0 stories).
--
-- After: the search is split into keywords (letters/digits only -- nothing
-- the reader types can become tsquery or LIKE syntax); every keyword must
-- appear somewhere in the story, in any order, as a word prefix across
-- title, excerpt, story text (every string in content_json), tag names and
-- place names (English and Chinese), or as a substring of the title or
-- excerpt (which covers mid-word and mid-Chinese-phrase matches that the
-- 'simple' parser can't split). Results stay newest-first, so the keyset
-- cursor pagination is untouched.
--
-- Signature and return columns are byte-for-byte unchanged (CREATE OR
-- REPLACE, same grants), so the deployed release keeps working: only which
-- stories match a search changes. Only the published, approved revision is
-- ever read (Engineering Rule 10) -- the WHERE clause around this is the
-- same as 20261015063409_custom_region_labels.sql.
--
-- Cost: the story-text, tag and place part is built per row at query time,
-- not indexed. Fine at today's size (dozens of published stories); if it
-- ever isn't, move it into a stored generated column with a GIN index.
--
-- Checked read-only against the live data before applying: kiw 0 -> 2,
-- supermarket 1 -> 3, pak 1 -> 4, "cheap food" 0 -> 2, visa 3 -> 3.

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
  -- Keywords: the search split into words (letters/digits only, so no
  -- tsquery or LIKE syntax can ever come from the reader).
  v_words text[];
  v_country_id uuid;
begin
  if p_cost_band is not null and p_cost_band not in ('under_5k', '5k_15k', '15k_30k', '30k_plus') then
    raise exception 'Invalid cost band: %', p_cost_band;
  end if;

  if p_search is not null then
    select array_agg(distinct lower(m[1]))
      into v_words
      from regexp_matches(left(p_search, 200), '[[:alnum:]]+', 'g') as m;
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
      -- Keyword search: EVERY keyword must appear somewhere in the story,
      -- in any order -- as the start of a word in the title, excerpt,
      -- story text, tags or places (prefix match, so "kiw" finds "Kiwi"
      -- and "supermarket" finds "Supermarkets"), or anywhere inside the
      -- title or excerpt (so a word inside a longer word, or the middle
      -- of a Chinese phrase, still matches).
      and (
        v_words is null
        or not exists (
          select 1
          from unnest(v_words) as kw(word)
          where not (
            (
              r.search_vector
              || setweight(jsonb_to_tsvector('simple', r.content_json, '["string"]'), 'D')
              || setweight(to_tsvector('simple',
                   coalesce((
                     select string_agg(coalesce(tg.name, srt.custom_label), ' ')
                     from public.story_revision_tags srt
                     left join public.tags tg on tg.id = srt.tag_id
                     where srt.revision_id = r.id
                   ), '') || ' ' ||
                   coalesce((
                     select string_agg(concat_ws(' ',
                       reg.name, reg.name_zh_cn, loc.custom_region_label,
                       dest.name, dest.name_zh_cn, loc.custom_destination_label), ' ')
                     from public.story_revision_locations loc
                     left join public.regions reg on reg.id = loc.region_id
                     left join public.destinations dest on dest.id = loc.destination_id
                     where loc.revision_id = r.id
                   ), '')), 'C')
            ) @@ to_tsquery('simple', quote_literal(kw.word) || ':*')
            or r.title ilike '%' || kw.word || '%'
            or coalesce(r.excerpt, '') ilike '%' || kw.word || '%'
          )
        )
      )
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
