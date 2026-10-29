-- Contributor journey: one map per contributor, one pin per story.
--
-- WHY. The owner decided (2026-10-29) that the journey map is a contributor's
-- whole working-holiday route, not the route inside one story. Each pin is a
-- PLACE tied to one of the contributor's own PUBLISHED New Zealand stories;
-- opening the pin opens that story. Main stories are the main pins, and their
-- sub stories (stories.parent_story_id, 20261021085920_story_folders.sql) sit
-- inside them. Readers see it as a Journey tab on the contributor's profile.
--
-- This replaces the per-revision design (20261029042052_story_revision_stops).
-- Expand/contract: this migration only ADDS, so it can go live before the app
-- that uses it. The old table and RPCs are removed separately, in
-- 20261029130000_drop_story_revision_stops.sql, which must only be applied
-- once the app release that stops calling them is deployed.
--
-- Same rules as story folders, which this deliberately mirrors:
--   * the place lives on the STORY (not the revision) and goes public the
--     moment it is set, without review -- the same documented exception to
--     Engineering Rule 11 that folders use (docs/content-governance.md). It
--     can only ever be attached to a story that already passed moderation;
--   * only the story's OWNER can set it (_is_story_owner());
--   * setting needs the story PUBLISHED and in New Zealand; clearing is
--     always allowed for the owner, whatever the state;
--   * public reads gate every story with _story_is_publicly_visible(), so a
--     taken-down / archived / consent-revoked story drops off the map
--     without its place being cleared;
--   * no version bump (an open editor tab must not go stale);
--   * logged by the caller (story.journey.set / story.journey.cleared).
--
-- Privacy (Rule 15): coordinates are rounded to 2 dp (~1 km) and must sit
-- inside the NZ bounding box -- rejected, not clamped -- same bounds the
-- per-revision stops used. Readers only ever see the contributor's label.
--
-- `stories` has no RLS policies and no table grants for anon/authenticated
-- (checked live before writing this): the only writer of these columns is
-- set_story_journey_place().
--
-- Error codes: WHV11 not found / not yours and WHV15 not published keep the
-- meaning folders give them. New: WHV17 story is not in New Zealand, WHV18
-- invalid place (bounds or label).

-- --------------------------------------------------------------------------
-- The columns: all three set, or all three null.
-- --------------------------------------------------------------------------
alter table public.stories
  add column journey_label text,
  add column journey_latitude numeric(5, 2),
  add column journey_longitude numeric(5, 2),
  add constraint stories_journey_place_all_or_none check (
    (journey_label is null and journey_latitude is null and journey_longitude is null)
    or (journey_label is not null and journey_latitude is not null and journey_longitude is not null)
  ),
  add constraint stories_journey_latitude_nz
    check (journey_latitude is null or journey_latitude between -47.5 and -34.0),
  add constraint stories_journey_longitude_nz
    check (journey_longitude is null or journey_longitude between 166.0 and 178.9),
  add constraint stories_journey_label_valid check (
    journey_label is null or (char_length(journey_label) between 1 and 60 and btrim(journey_label) <> '')
  );

comment on column public.stories.journey_label is
  'Contributor-written place name for this story''s pin on their journey map, or null. Written only by set_story_journey_place(), together with journey_latitude/journey_longitude. Public the moment it is set (not moderated; documented exception to Engineering Rule 11). Public reads follow it only when _story_is_publicly_visible().';
comment on column public.stories.journey_latitude is
  'Journey-map pin latitude, rounded to 2 dp, NZ bounds. See journey_label.';
comment on column public.stories.journey_longitude is
  'Journey-map pin longitude, rounded to 2 dp, NZ bounds. See journey_label.';

create index stories_journey_pinned_idx
  on public.stories (contributor_id)
  where journey_latitude is not null;

-- --------------------------------------------------------------------------
-- set_story_journey_place(): the only writer. A null latitude clears the pin.
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

  if v_story.country_id is distinct from (select c.id from public.countries c where c.slug = 'new-zealand') then
    raise exception 'Only New Zealand stories can be pinned on the journey map' using errcode = 'WHV17';
  end if;

  if v_label = '' then
    raise exception 'Give this place a name' using errcode = 'WHV18';
  end if;
  if p_longitude is null or v_lat not between -47.5 and -34.0 or v_lng not between 166.0 and 178.9 then
    raise exception 'The place must be inside New Zealand' using errcode = 'WHV18';
  end if;

  update public.stories
    set journey_label = v_label, journey_latitude = v_lat, journey_longitude = v_lng
    where id = p_story_id;
end;
$$;
comment on function public.set_story_journey_place(uuid, text, numeric, numeric) is
  'Owner only: pins a published New Zealand story on the contributor''s journey map (public immediately, no review), or clears the pin with a null latitude. Label trimmed and cut to 60; coordinates rounded to 2 dp and NZ-bounds-checked (rejected, not clamped). Refusals: WHV11 not found/not yours, WHV15 not published, WHV17 not New Zealand, WHV18 bad label or out of bounds (all checked only when setting).';

revoke execute on function public.set_story_journey_place(uuid, text, numeric, numeric) from public, anon, authenticated;
grant execute on function public.set_story_journey_place(uuid, text, numeric, numeric) to authenticated;

-- --------------------------------------------------------------------------
-- get_my_journey(): the caller's own stories with their pin, for the
-- contributor's journey page. Same source-kind-partitioned ownership check
-- as get_my_story_folders() / list_my_stories().
-- --------------------------------------------------------------------------
create or replace function public.get_my_journey()
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
    coalesce(pr.title, dr.title),
    s.lifecycle_status,
    coalesce(s.lifecycle_status = 'published' and s.published_revision_id is not null and co.slug = 'new-zealand', false),
    coalesce(co.slug = 'new-zealand', false),
    s.parent_story_id,
    s.journey_label,
    s.journey_latitude,
    s.journey_longitude,
    pr.trip_start_date
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
  'Owner-scoped, same ownership check as get_my_story_folders(): all of the caller''s own stories with their folder parent and journey pin. pinnable is true only for a published New Zealand story. Ordered by the published revision''s trip_start_date, then published_at.';

revoke execute on function public.get_my_journey() from public, anon, authenticated;
grant execute on function public.get_my_journey() to authenticated;

-- --------------------------------------------------------------------------
-- get_published_contributor_journey(): the public read. Every pinned,
-- publicly visible NZ story of one contributor, in trip order. parent_story_id
-- is returned only when the main story is ALSO pinned, publicly visible and
-- the same contributor's -- otherwise the sub story stands as its own pin.
-- --------------------------------------------------------------------------
create or replace function public.get_published_contributor_journey(p_contributor_id uuid)
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
        and p.journey_latitude is not null
        and public._story_is_publicly_visible(p.id)
    ),
    s.journey_label,
    s.journey_latitude,
    s.journey_longitude,
    r.trip_start_date
  from public.stories s
  join public.story_revisions r on r.id = s.published_revision_id
  join public.countries co on co.id = s.country_id and co.slug = 'new-zealand'
  where s.contributor_id = p_contributor_id
    and s.journey_latitude is not null
    and public._story_is_publicly_visible(s.id)
  order by r.trip_start_date asc nulls last, s.published_at asc, s.id
  limit 200;
$$;
comment on function public.get_published_contributor_journey(uuid) is
  'Public: one contributor''s journey map -- every pinned, publicly visible New Zealand story ({story_id,slug,title,excerpt,parent_story_id,journey_label,journey_latitude,journey_longitude,trip_start_date}), trip order, max 200. parent_story_id only when that main story is also pinned and publicly visible. Only the published revision is read.';

revoke execute on function public.get_published_contributor_journey(uuid) from public, anon, authenticated;
grant execute on function public.get_published_contributor_journey(uuid) to anon, authenticated;
