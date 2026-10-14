-- create_editorial_import_draft(): append p_country_slug as a new trailing
-- parameter with a 'new-zealand' default, so every editor-created story
-- (blank or PDF) picks a country the same way create_self_service_draft()
-- already does for contributors (20261014085842_countries.sql). Via CREATE
-- OR REPLACE this would be legal (only adding a trailing defaulted
-- parameter -- no signature break on its face), BUT CREATE OR REPLACE with
-- a different argument list actually creates a SECOND overload in
-- Postgres, not a replacement -- after that, every existing named-argument
-- call that omits p_country_slug fails with "function is not unique". The
-- 9-arg version is dropped first, same fix already applied to
-- create_self_service_draft() and get_published_story() in
-- 20261014085842_countries.sql.
--
-- Body is otherwise byte-for-byte the live
-- 20260803090700_story_lifecycle_functions.sql definition, plus
-- country_id on the stories insert and the unknown-country guard (same
-- shape as create_self_service_draft()'s own v_country_id lookup). Every
-- column reference in that lookup is qualified with a table alias
-- (co.id, co.slug, co.active) -- an unqualified name clashing with an
-- OUT/RETURNS TABLE column (story_id/revision_id here) has broken
-- prod-like code in this repo before.
drop function if exists public.create_editorial_import_draft(
  uuid, text, text, jsonb, date, date, smallint, text, integer, text, uuid
);

create function public.create_editorial_import_draft(
  p_contributor_id uuid,
  p_title text,
  p_excerpt text default null,
  p_content_json jsonb default '[]'::jsonb,
  p_trip_start_date date default null,
  p_trip_end_date date default null,
  p_trip_year smallint default null,
  p_travel_style text default null,
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

comment on function public.create_editorial_import_draft(
  uuid, text, text, jsonb, date, date, smallint, text, integer, text, uuid, text
) is
  'Creates an editorial import story-shell + first draft revision for the given contributor. p_country_slug defaults to new-zealand (unchanged historical behaviour); the editorial "new import" page passes the editor''s chosen country explicitly once China ships. Region selections on this story are enforced by story_revision_locations_validate_country() to belong to the same country.';

revoke execute on function public.create_editorial_import_draft(
  uuid, text, text, jsonb, date, date, smallint, text, integer, text, uuid, text
) from public, anon, authenticated;
grant execute on function public.create_editorial_import_draft(
  uuid, text, text, jsonb, date, date, smallint, text, integer, text, uuid, text
) to authenticated;
