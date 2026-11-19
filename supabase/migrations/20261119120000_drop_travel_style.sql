-- Drop travel style from the database.
--
-- v4.3.0 (commit 80e6c21, "feat(stories): remove travel style") removed travel style from
-- every UI, filter, moderation view, PDF export and copy string, and left these database
-- objects in place, unused, for a separate approved migration. This is that migration.
--
-- Postgres does not track a function body's column references, so dropping the column alone
-- would succeed and then break, at call time, every function still naming it -- including the
-- story_revisions immutability trigger, which fires on every draft save. Every function whose
-- latest definition mentions travel_style is therefore recreated first, from that definition
-- verbatim (body, security definer, search_path, comment, revoke/grant), minus travel_style.
--
-- Functions whose argument list or RETURNS TABLE changes are dropped and recreated (Postgres
-- cannot change either with CREATE OR REPLACE), which also drops their grants and comments,
-- so both are restated. create_next_draft_revision and the trigger function keep their
-- signature, so they use CREATE OR REPLACE and keep their grants and trigger binding.
--
-- DATA LOSS: dropping story_revisions.travel_style permanently deletes whatever travel-style
-- text existing revisions held.

-- ---------------------------------------------------------------------------
-- save_revision_draft: latest definition 20260812090000, travel_style removed.
-- ---------------------------------------------------------------------------
drop function if exists public.save_revision_draft(uuid, integer, text, text, jsonb, date, date, smallint, text, integer, text);

create function public.save_revision_draft(
  p_revision_id uuid,
  p_expected_version integer,
  p_title text,
  p_excerpt text default null,
  p_content_json jsonb default '[]'::jsonb,
  p_trip_start_date date default null,
  p_trip_end_date date default null,
  p_trip_year smallint default null,
  p_total_expense_nzd_cents integer default null,
  p_contributor_note text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_story_id uuid;
  v_story public.stories;
  v_new_version integer;
  v_invalid_image_count integer;
  v_content_text text;
begin
  select story_id into v_story_id from public.story_revisions where id = p_revision_id;
  if v_story_id is null then
    raise exception 'No such revision: %', p_revision_id;
  end if;

  select * into v_story from public.stories where id = v_story_id for update;
  if v_story.version <> p_expected_version then
    raise exception 'Stale version for story % (expected %, got %)', v_story_id, v_story.version, p_expected_version;
  end if;

  if not coalesce(public._is_story_owner(v_story_id) or v_story.assigned_editor_id = auth.uid(), false) then
    raise exception 'Only the story owner or assigned editor can edit this revision';
  end if;
  if not public._revision_is_editable(p_revision_id) then
    raise exception 'Revision % is not currently editable', p_revision_id;
  end if;

  v_content_text := coalesce(p_content_json->0->>'text', '');

  begin
    select count(*) into v_invalid_image_count
    from (
      select (m[1])::uuid as media_id
      from regexp_matches(v_content_text, '!\[\[([0-9a-fA-F-]{36})(?:\|[0-9]{2,4})?\]\]', 'g') as m
    ) embedded
    where not exists (
      select 1
      from public.story_revision_media srm
      where srm.revision_id = p_revision_id
        and srm.media_id = embedded.media_id
    );
  exception when invalid_text_representation then
    raise exception 'Story content references an image with an invalid id';
  end;

  if v_invalid_image_count > 0 then
    raise exception 'Story content references an image that is not attached to this revision';
  end if;

  update public.story_revisions
  set title = p_title,
      excerpt = p_excerpt,
      content_json = coalesce(p_content_json, '[]'::jsonb),
      trip_start_date = p_trip_start_date,
      trip_end_date = p_trip_end_date,
      trip_year = p_trip_year,
      total_expense_nzd_cents = p_total_expense_nzd_cents,
      contributor_note = p_contributor_note,
      updated_by = auth.uid()
  where id = p_revision_id;

  update public.stories set version = version + 1 where id = v_story_id
    returning version into v_new_version;

  return v_new_version;
end;
$$;

comment on function public.save_revision_draft(uuid, integer, text, text, jsonb, date, date, smallint, integer, text) is
  'Returns the authoritative new story.version (Prompt 4 Sub-phase 4). Extended in 20260812090000 to tolerate an optional |<width> suffix on ![[mediaId]] embed tokens (drag-to-resize) when extracting/validating referenced media ids -- see this migration''s header comment.';

revoke execute on function public.save_revision_draft(uuid, integer, text, text, jsonb, date, date, smallint, integer, text) from public, anon, authenticated;
grant execute on function public.save_revision_draft(uuid, integer, text, text, jsonb, date, date, smallint, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- create_self_service_draft: latest definition 20261014085842, travel_style removed.
-- ---------------------------------------------------------------------------
drop function if exists public.create_self_service_draft(text, text, jsonb, date, date, smallint, text, integer, text, text);

create function public.create_self_service_draft(
  p_title text,
  p_excerpt text default null,
  p_content_json jsonb default '[]'::jsonb,
  p_trip_start_date date default null,
  p_trip_end_date date default null,
  p_trip_year smallint default null,
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
    trip_year, total_expense_nzd_cents, contributor_note, created_by, updated_by
  )
  values (
    v_story_id, 1, p_title, p_excerpt, coalesce(p_content_json, '[]'::jsonb), p_trip_start_date,
    p_trip_end_date, p_trip_year, p_total_expense_nzd_cents, p_contributor_note,
    auth.uid(), auth.uid()
  )
  returning id into v_revision_id;

  update public.stories set current_draft_revision_id = v_revision_id where id = v_story_id;

  return query select v_story_id, v_revision_id;
end;
$$;

comment on function public.create_self_service_draft(text, text, jsonb, date, date, smallint, integer, text, text) is
  'Creates the story-shell + first draft revision a contributor edits from. p_country_slug defaults to new-zealand (unchanged historical behaviour); the "new story" form passes the contributor''s chosen country explicitly once China ships. Region selections on this story are enforced by story_revision_locations_validate_country() to belong to the same country.';

revoke execute on function public.create_self_service_draft(text, text, jsonb, date, date, smallint, integer, text, text) from public, anon, authenticated;
grant execute on function public.create_self_service_draft(text, text, jsonb, date, date, smallint, integer, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- create_editorial_import_draft: latest definition 20261014214918, travel_style removed.
-- ---------------------------------------------------------------------------
drop function if exists public.create_editorial_import_draft(uuid, text, text, jsonb, date, date, smallint, text, integer, text, uuid, text);

create function public.create_editorial_import_draft(
  p_contributor_id uuid,
  p_title text,
  p_excerpt text default null,
  p_content_json jsonb default '[]'::jsonb,
  p_trip_start_date date default null,
  p_trip_end_date date default null,
  p_trip_year smallint default null,
  p_total_expense_nzd_cents integer default null,
  p_contributor_note text default null,
  p_assigned_editor_id uuid default null,
  p_country_slug text default 'new-zealand'
)
returns table (story_id uuid, revision_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_user_id uuid;
  v_country_id uuid;
  v_story_id uuid;
  v_revision_id uuid;
begin
  if not (public.has_role(auth.uid(), 'editor') or public.has_role(auth.uid(), 'admin')) then
    raise exception 'Only an editor or admin can create an editorial import';
  end if;

  select linked_user_id into v_owner_user_id
  from public.contributors where id = p_contributor_id;
  if not found then
    raise exception 'No such contributor: %', p_contributor_id;
  end if;

  select co.id into v_country_id from public.countries co where co.slug = p_country_slug and co.active = true;
  if v_country_id is null then
    raise exception 'Unknown country: %', p_country_slug;
  end if;

  insert into public.stories (
    contributor_id, owner_user_id, source_kind, slug, assigned_editor_id, created_by, country_id
  )
  values (
    p_contributor_id, v_owner_user_id, 'editorial_import', public._generate_story_slug(p_title),
    coalesce(p_assigned_editor_id, auth.uid()), auth.uid(), v_country_id
  )
  returning id into v_story_id;

  insert into public.story_revisions (
    story_id, revision_number, title, excerpt, content_json, trip_start_date, trip_end_date,
    trip_year, total_expense_nzd_cents, contributor_note, created_by, updated_by
  )
  values (
    v_story_id, 1, p_title, p_excerpt, coalesce(p_content_json, '[]'::jsonb), p_trip_start_date,
    p_trip_end_date, p_trip_year, p_total_expense_nzd_cents, p_contributor_note,
    auth.uid(), auth.uid()
  )
  returning id into v_revision_id;

  update public.stories set current_draft_revision_id = v_revision_id where id = v_story_id;

  return query select v_story_id, v_revision_id;
end;
$$;

comment on function public.create_editorial_import_draft(uuid, text, text, jsonb, date, date, smallint, integer, text, uuid, text) is
  'Creates an editorial import story-shell + first draft revision for the given contributor. p_country_slug defaults to new-zealand (unchanged historical behaviour); the editorial "new import" page passes the editor''s chosen country explicitly once China ships. Region selections on this story are enforced by story_revision_locations_validate_country() to belong to the same country.';

revoke execute on function public.create_editorial_import_draft(uuid, text, text, jsonb, date, date, smallint, integer, text, uuid, text) from public, anon, authenticated;
grant execute on function public.create_editorial_import_draft(uuid, text, text, jsonb, date, date, smallint, integer, text, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- list_published_stories: latest definition 20261118090000, travel_style removed.
-- ---------------------------------------------------------------------------
drop function if exists public.list_published_stories(timestamptz, uuid, integer, uuid, uuid, uuid, uuid, smallint, text, uuid, text, boolean, uuid, text, text);

create function public.list_published_stories(
  p_cursor_published_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 20,
  p_region_id uuid default null,
  p_destination_id uuid default null,
  p_work_type_id uuid default null,
  p_tag_id uuid default null,
  p_trip_year smallint default null,
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
      s.id, s.slug, r.title, r.excerpt, s.published_at, r.trip_year,
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
        when c.attribution_type <> 'anonymous'
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

revoke execute on function public.list_published_stories(timestamptz, uuid, integer, uuid, uuid, uuid, uuid, smallint, uuid, text, boolean, uuid, text, text) from public, anon, authenticated;
grant execute on function public.list_published_stories(timestamptz, uuid, integer, uuid, uuid, uuid, uuid, smallint, uuid, text, boolean, uuid, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- get_published_story: latest definition 20261118090000, travel_style removed.
-- ---------------------------------------------------------------------------
drop function if exists public.get_published_story(text, text);

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
      r.trip_year, r.total_expense_nzd_cents, v_story.published_at,
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
        when v_contributor.attribution_type <> 'anonymous'
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

-- ---------------------------------------------------------------------------
-- get_story_for_moderator: latest definition 20261015063409, travel_style removed.
-- ---------------------------------------------------------------------------
drop function if exists public.get_story_for_moderator(uuid);

create function public.get_story_for_moderator(p_revision_id uuid)
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

-- ---------------------------------------------------------------------------
-- get_story_preview: latest definition 20261007102405, travel_style removed.
-- ---------------------------------------------------------------------------
drop function if exists public.get_story_preview(uuid);

create function public.get_story_preview(p_story_id uuid)
returns table (
  story_id uuid,
  title text,
  excerpt text,
  content_json jsonb,
  trip_start_date date,
  trip_end_date date,
  trip_year smallint,
  total_expense_nzd_cents integer,
  source_kind public.story_source_kind,
  lifecycle_status public.story_lifecycle_status,
  revision_id uuid,
  revision_status public.story_revision_status,
  version integer,
  attribution_type public.attribution_type,
  attribution_value text,
  viewer_relationship text,
  media jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_story public.stories;
  v_revision_id uuid;
  v_contributor public.contributors;
  v_relationship text;
begin
  select * into v_story from public.stories where id = p_story_id;
  if not found then raise exception 'No such story: %', p_story_id; end if;
  select * into v_contributor from public.contributors where id = v_story.contributor_id;

  if v_story.source_kind = 'self_submitted' then
    if v_story.owner_user_id = auth.uid() then
      v_relationship := 'owner';
    elsif v_story.assigned_editor_id = auth.uid() then
      v_relationship := 'assigned_editor';
    elsif public.has_role(auth.uid(), 'admin') then
      v_relationship := 'admin';
    else
      raise exception 'Not authorized to preview story %', p_story_id;
    end if;
  else
    if v_contributor.linked_user_id = auth.uid() then
      v_relationship := 'linked_contributor';
    elsif v_story.assigned_editor_id = auth.uid() then
      v_relationship := 'assigned_editor';
    elsif public.has_role(auth.uid(), 'admin') then
      v_relationship := 'admin';
    else
      raise exception 'Not authorized to preview story %', p_story_id;
    end if;
  end if;

  v_revision_id := coalesce(v_story.current_draft_revision_id, v_story.published_revision_id);
  if v_revision_id is null then
    raise exception 'Story % has no revision to preview', p_story_id;
  end if;

  return query
    select
      v_story.id, r.title, r.excerpt, r.content_json, r.trip_start_date, r.trip_end_date,
      r.trip_year, r.total_expense_nzd_cents, v_story.source_kind,
      v_story.lifecycle_status, r.id, r.revision_status, v_story.version,
      v_contributor.attribution_type, v_contributor.display_name, v_relationship,
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
              'sha256', m.sha256,
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
    where r.id = v_revision_id;
end;
$$;

comment on function public.get_story_preview(uuid) is
  'Owner/linked-contributor (source-kind-partitioned)/assigned-editor/admin private preview. Returns no storage path of any kind for media -- only media_id, presentation fields, sha256, and (round B) storageBackend, which the caller uses to render a Drive thumbnail via /media/<id> instead of attempting to mint a Supabase signed URL for it.';

revoke execute on function public.get_story_preview(uuid) from public, anon, authenticated;
grant execute on function public.get_story_preview(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- get_my_story_with_draft: latest definition 20260804092500, travel_style removed.
-- ---------------------------------------------------------------------------
drop function if exists public.get_my_story_with_draft(uuid);

create function public.get_my_story_with_draft(p_story_id uuid)
returns table (
  story_id uuid, slug text, source_kind public.story_source_kind, visibility public.story_visibility,
  lifecycle_status public.story_lifecycle_status, version integer, assigned_editor_id uuid,
  revision_id uuid, revision_number integer, revision_status public.story_revision_status,
  title text, excerpt text, content_json jsonb, trip_start_date date, trip_end_date date,
  trip_year smallint, total_expense_nzd_cents integer, contributor_note text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (
    public._is_story_owner(p_story_id)
    or exists (
      select 1 from public.stories s where s.id = p_story_id and s.assigned_editor_id = auth.uid()
    )
  ) then
    raise exception 'Not authorized to read story %', p_story_id;
  end if;
  return query
    select s.id, s.slug, s.source_kind, s.visibility, s.lifecycle_status, s.version, s.assigned_editor_id,
           r.id, r.revision_number, r.revision_status, r.title, r.excerpt, r.content_json,
           r.trip_start_date, r.trip_end_date, r.trip_year, r.total_expense_nzd_cents,
           r.contributor_note
    from public.stories s
    left join public.story_revisions r
      on r.id = coalesce(s.current_draft_revision_id, s.published_revision_id)
    where s.id = p_story_id;
end;
$$;

comment on function public.get_my_story_with_draft(uuid) is
  'Owner/linked-contributor (via _is_story_owner) OR the story''s assigned editor. Fixed in 20260804092000 to include the assigned editor; fixed again here (20260804092500) for an ambiguous-column-reference bug that fix introduced.';

revoke execute on function public.get_my_story_with_draft(uuid) from public, anon, authenticated;
grant execute on function public.get_my_story_with_draft(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- get_published_revision_snapshot: latest definition 20260805100900, travel_style removed.
-- ---------------------------------------------------------------------------
drop function if exists public.get_published_revision_snapshot(uuid);

create function public.get_published_revision_snapshot(p_story_id uuid)
returns table (
  revision_id uuid,
  title text,
  excerpt text,
  content_json jsonb,
  trip_start_date date,
  trip_end_date date,
  trip_year smallint,
  total_expense_nzd_cents integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_published_revision_id uuid;
begin
  if not (public.has_role(auth.uid(), 'moderator') or public.has_role(auth.uid(), 'admin')) then
    raise exception 'Only a moderator or admin can read a published revision snapshot';
  end if;

  select s.published_revision_id into v_published_revision_id
  from public.stories s where s.id = p_story_id;
  if v_published_revision_id is null then
    return;
  end if;

  return query
    select r.id, r.title, r.excerpt, r.content_json, r.trip_start_date, r.trip_end_date,
           r.trip_year, r.total_expense_nzd_cents
    from public.story_revisions r
    where r.id = v_published_revision_id;
end;
$$;

comment on function public.get_published_revision_snapshot(uuid) is
  'Moderator/admin only. Returns the currently-published revision''s content fields (empty set if the story has never published), for diffing against a replacement revision under review.';

revoke execute on function public.get_published_revision_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.get_published_revision_snapshot(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- create_next_draft_revision: latest definition 20261029100156, travel_style removed.
-- ---------------------------------------------------------------------------
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
    trip_year, total_expense_nzd_cents, contributor_note,
    created_by, updated_by
  )
  select
    p_story_id, v_next_number, title, excerpt, content_json, trip_start_date, trip_end_date,
    trip_year, total_expense_nzd_cents, contributor_note,
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

-- ---------------------------------------------------------------------------
-- story_revisions_protect_immutable_content: latest definition 20261003051644, travel_style removed.
-- ---------------------------------------------------------------------------
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
      or new.total_expense_nzd_cents is distinct from old.total_expense_nzd_cents
      or new.contributor_note is distinct from old.contributor_note
    then
      raise exception 'Revision content is immutable once it leaves draft status (revision %)', old.id;
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- list_distinct_public_travel_styles: fed the removed public filter dropdown.
-- ---------------------------------------------------------------------------
drop function if exists public.list_distinct_public_travel_styles();

-- ---------------------------------------------------------------------------
-- The column itself. Nothing above references it any more.
-- ---------------------------------------------------------------------------
alter table public.story_revisions drop column travel_style;
