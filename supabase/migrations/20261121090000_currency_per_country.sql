-- Currency per country (docs/currency-per-country-plan.md).
--
-- Until now every amount was NZD whatever the story's country: story_revisions
-- .currency was pinned by check (currency = 'NZD'), so a China story's editor
-- said "Total expenses (NZD)". Currency is now data per country
-- (countries.currency_code, ISO 4217), and each revision carries the currency
-- its amounts were entered in.
--
-- * The DATABASE decides a revision's currency, never the client (Engineering
--   Rule 2): story_revisions_set_currency() sets it on every insert -- from
--   the story's previous revision when there is one (a new draft copies, and
--   edits, that revision's amounts), otherwise from the story's country. No
--   authoring RPC takes a currency parameter.
-- * Existing rows stay NZD: every amount stored so far was typed under an
--   "(NZD)" label. Only a draft with NO amounts whose country uses another
--   currency is switched, so its editor shows the right currency from now on.
-- * An amount never changes currency. story_revisions_guard_currency()
--   refuses changing a revision's currency while it has amounts (or once it
--   has left draft, via story_revisions_protect_immutable_content), and
--   set_story_country() refuses a country change that would need that.
-- * The amount columns keep their names (total_expense_nzd_cents,
--   amount_nzd_cents): renaming them would re-create every RPC that touches
--   them for no change in behaviour. They now hold minor units of the
--   revision's currency; see their column comments.
-- * The three reads that show amounts (get_published_story,
--   get_story_preview, get_my_story_with_draft) append a currency column.
--   Appended, so callers that ignore it keep working.
-- * Cost bands and /costs are unchanged: get_expense_aggregates() already
--   reads New Zealand stories only, and the app offers cost bands only for
--   NZD countries (amounts in different currencies are never banded,
--   averaged or added together).
--
-- No RLS or storage policy changes (Engineering Rule 21).

-- ---------------------------------------------------------------------------
-- countries.currency_code
-- ---------------------------------------------------------------------------
alter table public.countries add column currency_code text;

update public.countries set currency_code = 'NZD' where slug = 'new-zealand';
update public.countries set currency_code = 'CNY' where slug = 'china';
-- Any other row (none today) must be given its currency by hand before this
-- can apply: guessing one would mislabel that country's amounts.

alter table public.countries alter column currency_code set not null;
alter table public.countries
  add constraint countries_currency_code_format check (currency_code ~ '^[A-Z]{3}$');

comment on column public.countries.currency_code is
  'ISO 4217 code the country''s stories record amounts in (NZD, CNY). Copied onto each new story revision by story_revisions_set_currency().';

-- ---------------------------------------------------------------------------
-- story_revisions.currency: any ISO 4217 code, no default
-- ---------------------------------------------------------------------------
alter table public.story_revisions drop constraint story_revisions_currency_nzd_only;
alter table public.story_revisions
  add constraint story_revisions_currency_format check (currency ~ '^[A-Z]{3}$');
-- No default: story_revisions_set_currency() always sets it, and a write that
-- somehow bypassed that should fail on NOT NULL, not silently become NZD.
alter table public.story_revisions alter column currency drop default;

comment on column public.story_revisions.currency is
  'ISO 4217 code of every amount on this revision (total_expense_nzd_cents and its story_revision_expenses rows). Set by story_revisions_set_currency(), never by a caller; changed only by set_story_country() on a draft with no amounts.';
comment on column public.story_revisions.total_expense_nzd_cents is
  'Total expenses in minor units (cents/fen) of this revision''s currency. Named before currencies other than NZD existed.';
comment on column public.story_revision_expenses.amount_nzd_cents is
  'Amount in minor units (cents/fen) of the revision''s currency (story_revisions.currency). Named before currencies other than NZD existed.';

-- ---------------------------------------------------------------------------
-- Backfill: a draft with no amounts takes its country's currency.
-- ---------------------------------------------------------------------------
update public.story_revisions r
set currency = co.currency_code
from public.stories s
join public.countries co on co.id = s.country_id
where s.id = r.story_id
  and r.revision_status = 'draft'
  and r.currency <> co.currency_code
  and r.total_expense_nzd_cents is null
  and not exists (
    select 1 from public.story_revision_expenses e where e.revision_id = r.id
  );

-- ---------------------------------------------------------------------------
-- story_revisions_set_currency: the database picks every new revision's currency.
-- ---------------------------------------------------------------------------
create function public.story_revisions_set_currency()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_currency text;
begin
  -- A later revision starts as a copy of the story's latest one, amounts
  -- included, so it keeps that revision's currency.
  select r.currency into v_currency
  from public.story_revisions r
  where r.story_id = new.story_id
  order by r.revision_number desc
  limit 1;

  if v_currency is null then
    select co.currency_code into v_currency
    from public.stories s
    join public.countries co on co.id = s.country_id
    where s.id = new.story_id;
  end if;

  if v_currency is null then
    raise exception 'No currency for story %', new.story_id;
  end if;

  -- Whatever the insert said is ignored: the currency is never the caller's
  -- to choose (Engineering Rule 2).
  new.currency := v_currency;
  return new;
end;
$$;

comment on function public.story_revisions_set_currency() is
  'BEFORE INSERT on story_revisions: sets currency from the story''s latest revision, else from its country (countries.currency_code). Overrides any value the insert supplied.';

create trigger story_revisions_set_currency
  before insert on public.story_revisions
  for each row execute function public.story_revisions_set_currency();

-- ---------------------------------------------------------------------------
-- story_revisions_guard_currency: a change of currency is only ever a draft
-- with no amounts following its story's country.
-- ---------------------------------------------------------------------------
create function public.story_revisions_guard_currency()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.currency is not distinct from old.currency then
    return new;
  end if;
  if old.revision_status <> 'draft' then
    raise exception 'Revision content is immutable once it leaves draft status (revision %)', old.id;
  end if;
  if old.total_expense_nzd_cents is not null
     or new.total_expense_nzd_cents is not null
     or exists (
       select 1 from public.story_revision_expenses e where e.revision_id = old.id
     )
  then
    raise exception 'Clear this story''s expenses before changing its country: amounts can''t change currency';
  end if;
  if new.currency is distinct from (
    select co.currency_code
    from public.stories s
    join public.countries co on co.id = s.country_id
    where s.id = new.story_id
  ) then
    raise exception 'A revision''s currency must be its story''s country''s currency (revision %)', old.id;
  end if;
  return new;
end;
$$;

comment on function public.story_revisions_guard_currency() is
  'BEFORE UPDATE OF currency on story_revisions: only a draft with no amounts may change currency, and only to its story''s country''s currency.';

create trigger story_revisions_guard_currency
  before update of currency on public.story_revisions
  for each row execute function public.story_revisions_guard_currency();

-- ---------------------------------------------------------------------------
-- story_revisions_protect_immutable_content: latest definition
-- 20261119120000; currency added to the protected columns.
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
      or new.currency is distinct from old.currency
      or new.contributor_note is distinct from old.contributor_note
    then
      raise exception 'Revision content is immutable once it leaves draft status (revision %)', old.id;
    end if;
  end if;
  return new;
end;
$$;


-- ---------------------------------------------------------------------------
-- Reads that show amounts: append currency. Copied from their latest
-- definitions (20261119120000_drop_travel_style.sql); the only changes are
-- the appended column, its select-list entry and the comment. Changing a
-- return type needs drop + create; grants are re-issued exactly as before.
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
  country_slug text,
  currency text
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
      (select co.slug from public.countries co where co.id = v_story.country_id),
      r.currency
    from public.story_revisions r
    where r.id = v_story.published_revision_id;
end;
$$;

comment on function public.get_published_story(text, text) is
  'Public, anon-readable. Same invariants as before this migration, plus an optional p_country_slug: when provided, a story whose country does not match returns no rows, same as an unknown slug. Appends country_slug to the result so callers can display/validate without a second lookup. Region join is LEFT (20261015) so a custom-region location still renders. Appends currency (20261121): the ISO 4217 code every amount on this revision is in -- total_expense_nzd_cents and each amount_nzd_cents are minor units of it, despite their names.';

revoke execute on function public.get_published_story(text, text) from public, anon, authenticated;
grant execute on function public.get_published_story(text, text) to anon, authenticated;

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
  media jsonb,
  currency text
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
      ),
      r.currency
    from public.story_revisions r
    where r.id = v_revision_id;
end;
$$;

comment on function public.get_story_preview(uuid) is
  'Owner/linked-contributor (source-kind-partitioned)/assigned-editor/admin private preview. Returns no storage path of any kind for media -- only media_id, presentation fields, sha256, and (round B) storageBackend, which the caller uses to render a Drive thumbnail via /media/<id> instead of attempting to mint a Supabase signed URL for it. Appends currency (20261121): the ISO 4217 code of the revision''s amounts.';

revoke execute on function public.get_story_preview(uuid) from public, anon, authenticated;
grant execute on function public.get_story_preview(uuid) to authenticated;

drop function if exists public.get_my_story_with_draft(uuid);

create function public.get_my_story_with_draft(p_story_id uuid)
returns table (
  story_id uuid, slug text, source_kind public.story_source_kind, visibility public.story_visibility,
  lifecycle_status public.story_lifecycle_status, version integer, assigned_editor_id uuid,
  revision_id uuid, revision_number integer, revision_status public.story_revision_status,
  title text, excerpt text, content_json jsonb, trip_start_date date, trip_end_date date,
  trip_year smallint, total_expense_nzd_cents integer, contributor_note text,
  currency text
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
           r.contributor_note, r.currency
    from public.stories s
    left join public.story_revisions r
      on r.id = coalesce(s.current_draft_revision_id, s.published_revision_id)
    where s.id = p_story_id;
end;
$$;

comment on function public.get_my_story_with_draft(uuid) is
  'Owner/linked-contributor (via _is_story_owner) OR the story''s assigned editor. Fixed in 20260804092000 to include the assigned editor; fixed again here (20260804092500) for an ambiguous-column-reference bug that fix introduced. Appends currency (20261121): the ISO 4217 code of the revision''s amounts (null only when the story has no revision).';

revoke execute on function public.get_my_story_with_draft(uuid) from public, anon, authenticated;
grant execute on function public.get_my_story_with_draft(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- set_story_country: latest definition 20261014205738; now also moves the
-- draft's currency, and refuses when the draft's amounts would change currency.
-- Same signature, so create or replace keeps its grants; re-issued anyway.
-- ---------------------------------------------------------------------------
create or replace function public.set_story_country(p_story_id uuid, p_country_slug text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_story public.stories;
  v_draft_revision_id uuid;
  v_country_id uuid;
  v_currency text;
begin
  select * into v_story from public.stories s where s.id = p_story_id for update;
  if not found then
    raise exception 'No such story: %', p_story_id;
  end if;

  if not coalesce(
    public._is_story_owner(p_story_id)
      or v_story.assigned_editor_id = auth.uid(),
    false
  ) then
    raise exception 'Only the story owner or assigned editor can change this story''s country';
  end if;

  if v_story.published_revision_id is not null then
    raise exception 'Country can''t be changed after a story is published';
  end if;

  v_draft_revision_id := v_story.current_draft_revision_id;
  if v_draft_revision_id is null or not public._revision_is_editable(v_draft_revision_id) then
    raise exception 'Story % has no editable draft revision', p_story_id;
  end if;

  select co.id into v_country_id
  from public.countries co
  where co.slug = p_country_slug and co.active = true;
  if v_country_id is null then
    raise exception 'Unknown country: %', p_country_slug;
  end if;

  if v_country_id = v_story.country_id then
    return;
  end if;

  -- Amounts never change currency (20261121): a draft with amounts can only
  -- move to a country with the same currency. Checked before anything is
  -- deleted, so a refusal leaves the draft exactly as it was.
  select co.currency_code into v_currency from public.countries co where co.id = v_country_id;
  if v_currency is distinct from (
    select r.currency from public.story_revisions r where r.id = v_draft_revision_id
  ) and (
    exists (
      select 1 from public.story_revisions r
      where r.id = v_draft_revision_id and r.total_expense_nzd_cents is not null
    )
    or exists (
      select 1 from public.story_revision_expenses e where e.revision_id = v_draft_revision_id
    )
  ) then
    raise exception 'Clear this story''s expenses before changing its country: amounts can''t change currency';
  end if;

  delete from public.story_revision_locations srl
  where srl.revision_id = v_draft_revision_id
    and srl.region_id in (
      select r.id from public.regions r where r.country_id <> v_country_id
    );

  update public.stories s
    set country_id = v_country_id, version = s.version + 1
    where s.id = p_story_id;

  -- After the story's country moved: story_revisions_guard_currency() checks
  -- the new currency against it.
  update public.story_revisions r
    set currency = v_currency
    where r.id = v_draft_revision_id and r.currency is distinct from v_currency;
end;
$$;

comment on function public.set_story_country(uuid, text) is
  'Changes an existing draft story''s country. Owner or assigned editor only (same as _authorize_revision_edit). Refuses once published_revision_id is not null (country is locked after first publication -- Engineering Rule 11, since stories.country_id is not revision-scoped). Refuses an unknown/inactive country slug or a story with no editable draft revision. On an actual change, drops the current draft''s story_revision_locations whose region belongs to the old country, then bumps stories.version by 1. Since 20261121 also moves the draft''s currency to the new country''s, and refuses the change when the draft has amounts in a different currency.';

revoke execute on function public.set_story_country(uuid, text) from public, anon, authenticated;
grant execute on function public.set_story_country(uuid, text) to authenticated;
