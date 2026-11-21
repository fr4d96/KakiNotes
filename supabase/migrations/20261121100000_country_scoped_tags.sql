-- Tags belong to a country (2026-11-21).
--
-- Until now `tags` was one global list: a China story's editor offered the
-- New Zealand WHV tags ("Tax & IRD", "South Island", "Fruit picking", ...)
-- and the /cn/stories filter bar listed them too. Tags now carry a
-- country_id exactly like regions do, and every reader and writer is scoped
-- to the story's own country:
--
-- * tags.country_id (NOT NULL). Every existing row is New Zealand's -- that
--   is what each one was written for. The column DEFAULTS to New Zealand
--   (via _default_tag_country_id()) so an insert that predates countries --
--   supabase/seed.sql, the RLS integration suite's fixture tags -- keeps
--   meaning exactly what it meant, the same "default to new-zealand"
--   choice list_published_stories(p_country_slug) made in 20261014085842.
-- * Slugs are unique per country, not globally: China gets its own
--   "budget-travel" / "solo-travel" rows rather than sharing NZ's.
-- * A China tag set is seeded (general travel topics -- the China section
--   is general first-person travel, not WHV; see 20261014085842).
-- * story_revision_tags_validate_country(): a story may only reference its
--   own country's tags -- the same trigger shape as
--   story_revision_locations_validate_country() for regions.
-- * set_revision_tags(): a typed label is folded into an existing tag only
--   when that tag is in the story's country (otherwise a China contributor
--   typing "Hospitality" would be handed NZ's row).
-- * A story whose country changes (set_story_country(), drafts only) has its
--   draft's tags moved to the new country: same-slug tag if the new country
--   has one, otherwise the tag's name kept as the contributor's own custom
--   label. Done by an AFTER UPDATE trigger on stories rather than by
--   re-creating set_story_country(), so this migration does not depend on
--   that function's current body.
-- * One-time backfill: any existing non-NZ story already referencing an NZ
--   tag is moved the same way, so the validation trigger never rejects a
--   later copy-into-next-draft of that story.

-- --------------------------------------------------------------------------
-- tags.country_id
-- --------------------------------------------------------------------------

create function public._default_tag_country_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.countries where slug = 'new-zealand'
$$;

comment on function public._default_tag_country_id() is
  'Internal: column default for tags.country_id -- New Zealand, so inserts written before tags were country-scoped keep their meaning. No API grants.';

revoke execute on function public._default_tag_country_id() from public, anon, authenticated;

alter table public.tags add column country_id uuid references public.countries (id) on delete restrict;

update public.tags set country_id = public._default_tag_country_id() where country_id is null;

alter table public.tags alter column country_id set default public._default_tag_country_id();
alter table public.tags alter column country_id set not null;
create index tags_country_id_idx on public.tags (country_id);

alter table public.tags drop constraint tags_slug_key;
alter table public.tags add constraint tags_country_slug_key unique (country_id, slug);

-- --------------------------------------------------------------------------
-- China's tag set. Reference data, not contributor content -- seeded in a
-- migration like the curated NZ set (20260816100100).
-- --------------------------------------------------------------------------

insert into public.tags (slug, name, country_id)
select v.slug, v.name, c.id
from public.countries c
cross join (values
  -- Getting around
  ('high-speed-rail',      'High-speed rail'),
  ('public-transport',     'Public transport'),
  ('road-trip',            'Road trip'),
  -- Practicalities
  ('visa-and-entry',       'Visa & entry'),
  ('mobile-payments',      'Mobile payments'),
  ('staying-connected',    'Staying connected'),
  ('language-barrier',     'Language barrier'),
  ('cost-of-living',       'Cost of living'),
  ('culture-shock',        'Culture shock'),
  -- Trip shape
  ('budget-travel',        'Budget travel'),
  ('solo-travel',          'Solo travel'),
  ('couple-travel',        'Couple travel'),
  ('family-travel',        'Family travel'),
  ('first-time-traveller', 'First-time traveller'),
  ('hotels-and-hostels',   'Hotels & hostels'),
  -- What you do there
  ('food',                 'Food'),
  ('street-food',          'Street food'),
  ('big-cities',           'Big cities'),
  ('ancient-towns',        'Ancient towns'),
  ('history-and-temples',  'History & temples'),
  ('nature-and-scenery',   'Nature & scenery'),
  ('hiking',               'Hiking'),
  ('shopping',             'Shopping'),
  ('studying',             'Studying')
) as v (slug, name)
where c.slug = 'china'
on conflict (country_id, slug) do nothing;

-- --------------------------------------------------------------------------
-- A story only references its own country's tags.
-- --------------------------------------------------------------------------

create function public.story_revision_tags_validate_country()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_story_country_id uuid;
  v_tag_country_id uuid;
begin
  -- A contributor's own typed label has no country to check.
  if new.tag_id is null then
    return new;
  end if;

  select s.country_id into v_story_country_id
  from public.story_revisions r
  join public.stories s on s.id = r.story_id
  where r.id = new.revision_id;

  select t.country_id into v_tag_country_id
  from public.tags t
  where t.id = new.tag_id;

  if v_story_country_id is null or v_tag_country_id is null
     or v_story_country_id <> v_tag_country_id then
    raise exception 'tag % does not belong to the story''s country', new.tag_id;
  end if;

  return new;
end;
$$;

-- --------------------------------------------------------------------------
-- Moving a revision's tags to another country (used by the backfill below
-- and by the stories country-change trigger).
-- --------------------------------------------------------------------------

create function public._move_revision_tags_to_country(p_revision_id uuid, p_country_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  with removed as (
    delete from public.story_revision_tags srt
    using public.tags t
    where srt.revision_id = p_revision_id
      and t.id = srt.tag_id
      and t.country_id <> p_country_id
    returning t.slug, t.name
  ),
  mapped as (
    select distinct on (coalesce(m.id::text, lower(r.name)))
      m.id as tag_id,
      case when m.id is null then left(r.name, 100) end as custom_label
    from removed r
    left join public.tags m on m.country_id = p_country_id and m.slug = r.slug
    order by coalesce(m.id::text, lower(r.name))
  )
  insert into public.story_revision_tags (revision_id, tag_id, custom_label)
  select p_revision_id, mp.tag_id, mp.custom_label
  from mapped mp
  -- The CTE's snapshot predates the delete, but the deleted rows pointed at
  -- the OTHER country's tags, so they can never match here.
  where not exists (
    select 1 from public.story_revision_tags e
    where e.revision_id = p_revision_id
      and (e.tag_id = mp.tag_id or lower(e.custom_label) = lower(mp.custom_label))
  );
end;
$$;

comment on function public._move_revision_tags_to_country(uuid, uuid) is
  'Internal: re-points a revision''s tags from another country at the target country''s tag with the same slug, or keeps the tag''s name as a custom label when there is none. Deduplicates. No API grants.';

revoke execute on function public._move_revision_tags_to_country(uuid, uuid) from public, anon, authenticated;

-- One-time backfill, before the validation trigger exists. Touches every
-- revision of a non-NZ story, published ones included: the shown text is
-- unchanged (same name, as a tag or a custom label), and without it the
-- story's next draft copy would be rejected. The child-immutability guard
-- (20260803090300) is lifted for this statement only.
alter table public.story_revision_tags disable trigger story_revision_tags_protect_immutability;

do $$
declare
  rec record;
begin
  for rec in
    select distinct srt.revision_id, s.country_id
    from public.story_revision_tags srt
    join public.story_revisions r on r.id = srt.revision_id
    join public.stories s on s.id = r.story_id
    join public.tags t on t.id = srt.tag_id
    where t.country_id <> s.country_id
  loop
    perform public._move_revision_tags_to_country(rec.revision_id, rec.country_id);
  end loop;
end;
$$;

alter table public.story_revision_tags enable trigger story_revision_tags_protect_immutability;

create trigger story_revision_tags_validate_country
  before insert or update on public.story_revision_tags
  for each row
  execute function public.story_revision_tags_validate_country();

revoke execute on function public.story_revision_tags_validate_country() from public, anon, authenticated;

-- A draft story moved to another country takes its tags along. Country is
-- locked once published (set_story_country), so only the current draft is
-- ever touched -- and it passes the child-immutability guard because it is
-- the editable draft set_story_country() already checked.
create function public.stories_move_tags_on_country_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.current_draft_revision_id is not null then
    perform public._move_revision_tags_to_country(new.current_draft_revision_id, new.country_id);
  end if;
  return new;
end;
$$;

create trigger stories_move_tags_on_country_change
  after update of country_id on public.stories
  for each row
  when (old.country_id is distinct from new.country_id)
  execute function public.stories_move_tags_on_country_change();

revoke execute on function public.stories_move_tags_on_country_change() from public, anon, authenticated;

-- --------------------------------------------------------------------------
-- set_revision_tags(): fold a typed label into a tag of the story's own
-- country only. Otherwise identical to 20260816100000.
-- --------------------------------------------------------------------------

create or replace function public.set_revision_tags(
  p_revision_id uuid, p_expected_version integer, p_tags jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_story_id uuid;
  v_version integer;
  v_country_id uuid;
  v_count integer;
  v_max_tags constant integer := 20;
begin
  select public._authorize_revision_edit(p_revision_id) into v_story_id;
  select version, country_id into v_version, v_country_id from public.stories where id = v_story_id;
  if v_version <> p_expected_version then
    raise exception 'Stale version for story % (expected %, got %)', v_story_id, v_version, p_expected_version;
  end if;

  delete from public.story_revision_tags where revision_id = p_revision_id;

  -- A tag_id from another country is rejected by
  -- story_revision_tags_validate_country(), aborting the whole call.
  insert into public.story_revision_tags (revision_id, tag_id, custom_label)
  with input as (
    select
      nullif(rec ->> 'tag_id', '')::uuid as tag_id,
      nullif(trim(rec ->> 'custom_label'), '') as custom_label
    from jsonb_array_elements(coalesce(p_tags, '[]'::jsonb)) as rec
  ),
  resolved as (
    select
      coalesce(i.tag_id, m.id) as tag_id,
      case when i.tag_id is null and m.id is null then i.custom_label end as custom_label
    from input i
    left join lateral (
      select tg.id
      from public.tags tg
      where i.tag_id is null
        and i.custom_label is not null
        and tg.country_id = v_country_id
        and lower(tg.name) = lower(i.custom_label)
      order by tg.active desc, tg.created_at asc, tg.id asc
      limit 1
    ) m on true
  ),
  deduped as (
    select distinct on (coalesce(r.tag_id::text, lower(r.custom_label)))
      r.tag_id, r.custom_label
    from resolved r
    where r.tag_id is not null or r.custom_label is not null
    order by coalesce(r.tag_id::text, lower(r.custom_label))
  )
  select p_revision_id, d.tag_id, d.custom_label from deduped d;

  get diagnostics v_count = row_count;
  if v_count > v_max_tags then
    raise exception 'Too many tags for revision % (max % per story, got %)',
      p_revision_id, v_max_tags, v_count;
  end if;

  update public.stories set version = version + 1 where id = v_story_id;
end;
$$;

comment on function public.set_revision_tags(uuid, integer, jsonb) is
  'Replaces a revision''s tag set. Same edit-rights rule and optimistic-version check as every other authoring RPC. Deduplicates case-insensitively, folds a typed label that names an existing tag OF THE STORY''S COUNTRY into a reference to that tag, rejects another country''s tag (via story_revision_tags_validate_country), and caps a revision at 20 tags -- the enforcing boundary, not the client.';

revoke execute on function public.set_revision_tags(uuid, integer, jsonb)
  from public, anon, authenticated;
grant execute on function public.set_revision_tags(uuid, integer, jsonb) to authenticated;
