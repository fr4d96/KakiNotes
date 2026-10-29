-- A country above the region, in the authoring picker: `countries`, plus
-- `regions.country_id`.
--
-- WHAT THIS IS NOT. This is not multi-country support, which docs/product-spec.md
-- lists under MVP Non-Goals and this migration does not move. Exactly one row is
-- seeded (New Zealand) and it is the only active one; the story editor shows a
-- Country select above Region that has one answer today. What changes is the
-- SHAPE of the data: "which country" stops being a fact baked into the phrase
-- "New Zealand region" in UI copy and a hard-coded `countrycodes=nz` in the place
-- search, and becomes a row, which is what CLAUDE.md's product context asks for
-- ("nationality, destination, and work classification are DATA, not hard-coded
-- strings or enums baked into UI copy or logic"). A second country becomes an
-- insert plus its regions, not a schema change.
--
-- NOTHING IS STORED PER LOCATION. `story_revision_locations` is untouched, and
-- so are the Zod schemas and every RPC that reads a location. A location row
-- already references a region, and a region now belongs to exactly one country,
-- so the country of a location is DERIVED, never a second copy that can drift
-- out of agreement with the region beside it. The editor keeps a chosen country
-- in component state only, so that a half-filled row (country picked, region not
-- yet) has somewhere to live before it becomes a real location.
--
-- `code` is ISO 3166-1 alpha-2, lower case, because that is precisely what
-- Nominatim's `countrycodes` parameter takes (components/story/location-search.tsx
-- currently hard-codes "nz" there). Storing it means the place search can ask the
-- row instead of a constant the day a second country exists.
--
-- `name_zh_cn` beside `name`, same contract as regions/destinations/
-- expense_categories (20260914092322): null means "show `name`", and the app
-- never invents a translation.
--
-- Plain RLS with real grants, copied from `regions` rather than invented: this
-- is a lookup table with no ownership, no lifecycle and no sensitive column, so
-- it belongs with the other four in 20260803090000 and not behind a SECURITY
-- DEFINER function. Anyone reads the active rows; staff read all of them; only
-- admin writes.

-- --------------------------------------------------------------------------
-- Table
-- --------------------------------------------------------------------------

create table public.countries (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  code text not null unique,
  name text not null,
  name_zh_cn text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint countries_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,59}$'),
  constraint countries_code_format check (code ~ '^[a-z]{2}$'),
  constraint countries_name_length check (char_length(name) between 1 and 120),
  constraint countries_name_zh_cn_length
    check (name_zh_cn is null or char_length(name_zh_cn) between 1 and 120)
);

comment on table public.countries is
  'Lookup table for the country a region belongs to. One active row today (New Zealand); a second country is data, not a schema change.';
comment on column public.countries.code is
  'ISO 3166-1 alpha-2, lower case -- the exact form Nominatim''s countrycodes parameter takes.';
comment on column public.countries.name_zh_cn is
  'Simplified Chinese display name. Null means "show `name`"; the app never invents a translation.';

create trigger countries_set_updated_at before update on public.countries
  for each row execute function public.set_updated_at();

alter table public.countries enable row level security;

create policy "countries: anyone reads active countries"
  on public.countries for select to anon, authenticated using (active = true);
create policy "countries: staff read all countries"
  on public.countries for select to authenticated
  using (public.has_role(auth.uid(), 'editor') or public.has_role(auth.uid(), 'admin'));
create policy "countries: admin writes"
  on public.countries for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- --------------------------------------------------------------------------
-- The one row. A fixed uuid, so supabase/seed.sql can reference it without a
-- sub-select and so this migration is re-runnable against a database that has
-- already been seeded.
-- --------------------------------------------------------------------------

insert into public.countries (id, slug, code, name, name_zh_cn)
values ('44444444-1111-1111-1111-111111111101', 'new-zealand', 'nz', 'New Zealand', '新西兰')
on conflict (slug) do nothing;

-- --------------------------------------------------------------------------
-- regions.country_id. Added nullable, backfilled, then made NOT NULL -- every
-- region that exists is a New Zealand region, and leaving the column nullable
-- would invite a region with no country, which the picker has no way to show.
-- `on delete restrict` matches destinations -> regions: a country with regions
-- pointing at it cannot be deleted out from under them.
-- --------------------------------------------------------------------------

alter table public.regions
  add column country_id uuid references public.countries (id) on delete restrict;

update public.regions
set country_id = (select id from public.countries where slug = 'new-zealand')
where country_id is null;

alter table public.regions alter column country_id set not null;

create index regions_country_id_idx on public.regions (country_id);

comment on column public.regions.country_id is
  'The country this region belongs to. A story location''s country is derived through this FK and never stored per location.';
