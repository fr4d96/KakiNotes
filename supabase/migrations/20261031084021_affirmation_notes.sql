-- Affirmation notes: a signed-in contributor creates one or more share links;
-- anyone holding a link (no account) can leave a short, private note of
-- affirmation for that contributor. OWNER DECISION 2026-10-31 -- see
-- docs/implementation-status.md and docs/product-spec.md for how this sits
-- against the "no comments / messaging" MVP non-goal: these notes are
-- PRIVATE to the link owner (and admins). They are never public, never
-- indexed, never moderated, never shown to readers.
--
-- THE SHAPE, and why:
--
-- * Two tables, both RLS-on and both closed to anon. An anonymous visitor
--   never touches a table -- the only anon-callable surface is two
--   SECURITY DEFINER functions that each do exactly one narrow thing
--   (look up one active link by token; insert one note into one active
--   link). That is the same posture as check_rate_limit() and the public
--   contributor RPCs: a definer function returning a fixed, tiny shape,
--   rather than a policy that would let anon read or write a table.
--
-- * Link CREATION is RPC-only (no INSERT policy, no INSERT grant). The
--   client therefore never chooses the token or the owner (Engineering
--   Rule 2): the function takes owner_id from auth.uid() and generates the
--   token itself. The token is 256-ish bits (two gen_random_uuid() values,
--   hyphens stripped = 64 hex chars, ~244 random bits). gen_random_uuid()
--   is core Postgres (pg_catalog, v13+), so it needs no extension and no
--   search_path entry -- deliberately NOT pgcrypto's gen_random_bytes(),
--   which lives in the `extensions` schema on Supabase and would make this
--   function depend on an extension's install location.
--
-- * owner_id and token are IMMUTABLE after creation, enforced by
--   COLUMN-LEVEL GRANTS: authenticated holds UPDATE on (label, is_active)
--   only. A client that tries to PATCH owner_id or token is refused by
--   Postgres before RLS is even consulted. (The UPDATE policy's WITH CHECK
--   additionally pins owner_id = auth.uid(), belt and braces.) Chosen over
--   a trigger because a privilege can't be bypassed by a code path that
--   forgets to fire it; the updated_at trigger still works because trigger
--   assignments are not subject to the caller's column privileges.
--
-- * recipient_name shown on the writing page comes ONLY from
--   contributors.display_name, and only when that contributor has
--   explicitly made themselves public (public_status = 'public', a public
--   slug, and not attribution_type 'anonymous' -- the same gates the
--   contributor directory uses; Engineering Rule 16). Otherwise NULL and
--   the page uses a neutral heading. profiles.display_name is private
--   account data and is never read here.

-- --------------------------------------------------------------------------
-- Rate-limit scopes. The check on public.rate_limits is a deliberately
-- closed list (see 20260909130000), so the two new buckets are added here
-- rather than the table silently accepting any string.
-- --------------------------------------------------------------------------

alter table public.rate_limits
  drop constraint rate_limits_scope_known;

alter table public.rate_limits
  add constraint rate_limits_scope_known
  check (
    scope in (
      'ip', 'identifier',
      'reset_ip', 'reset_email',
      'signup_ip', 'signup_email',
      'pdf_preview_user', 'pdf_attach_user',
      -- maps_link_user exists on the hosted project (and has live rows) but
      -- no migration in this repo adds it -- drift found 2026-10-31 while
      -- applying this file. Kept so re-adding the check does not fail.
      'maps_link_user',
      'affirmation_ip', 'affirmation_token'
    )
  );

comment on constraint rate_limits_scope_known on public.rate_limits is
  'Closed list on purpose: a typo in a scope name should fail loudly, not silently create an empty bucket that limits nothing. Buckets are per-surface so none can spend another''s allowance. affirmation_ip / affirmation_token throttle anonymous note submissions.';

-- --------------------------------------------------------------------------
-- affirmation_links
-- --------------------------------------------------------------------------

create table public.affirmation_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  token text not null unique,
  label text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint affirmation_links_label_length
    check (label is null or char_length(label) <= 80),
  -- The shape create_affirmation_link() generates. Also what lets
  -- get_affirmation_link_for_writing() reject junk before touching an index.
  constraint affirmation_links_token_format
    check (token ~ '^[0-9a-f]{64}$')
);

comment on table public.affirmation_links is
  'Share links a contributor hands out so anyone can leave them a private note. Rows are created ONLY by create_affirmation_link(); owner_id and token are immutable (column-level UPDATE grant is label + is_active only).';
comment on column public.affirmation_links.token is
  'Unguessable capability token, 64 hex chars (~244 random bits), generated server-side. Possession of it is the only thing that lets an anonymous visitor write a note.';

create index affirmation_links_owner_id_idx
  on public.affirmation_links (owner_id);

create trigger affirmation_links_set_updated_at
  before update on public.affirmation_links
  for each row
  execute function public.set_updated_at();

alter table public.affirmation_links enable row level security;

revoke all on public.affirmation_links from public, anon, authenticated;
grant select, delete on public.affirmation_links to authenticated;
-- Column-level: owner_id, token, id and the timestamps can never be set by
-- a client. This is the immutability guarantee.
grant update (label, is_active) on public.affirmation_links to authenticated;

create policy "affirmation_links: owner reads own links"
  on public.affirmation_links
  for select
  to authenticated
  using (owner_id = (select auth.uid()));

create policy "affirmation_links: owner updates own links"
  on public.affirmation_links
  for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "affirmation_links: owner deletes own links"
  on public.affirmation_links
  for delete
  to authenticated
  using (owner_id = (select auth.uid()));

-- No INSERT policy and no INSERT grant: creation is create_affirmation_link().

-- --------------------------------------------------------------------------
-- affirmation_notes
-- --------------------------------------------------------------------------

create table public.affirmation_notes (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.affirmation_links (id) on delete cascade,
  body text not null,
  author_name text,
  created_at timestamptz not null default now(),
  constraint affirmation_notes_body_length
    check (char_length(btrim(body)) between 1 and 1000),
  constraint affirmation_notes_author_name_length
    check (author_name is null or char_length(author_name) <= 60)
);

comment on table public.affirmation_notes is
  'Private notes left through an affirmation link. Readable only by the link owner and admins; deletable only by the link owner. Plain text -- never rendered as HTML. Rows are created ONLY by submit_affirmation_note().';

-- (link_id, created_at) serves both the FK lookup and the per-link hourly
-- cap in submit_affirmation_note().
create index affirmation_notes_link_id_created_at_idx
  on public.affirmation_notes (link_id, created_at);

alter table public.affirmation_notes enable row level security;

revoke all on public.affirmation_notes from public, anon, authenticated;
grant select, delete on public.affirmation_notes to authenticated;

create policy "affirmation_notes: owner or admin reads notes"
  on public.affirmation_notes
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.affirmation_links l
      where l.id = affirmation_notes.link_id
        and l.owner_id = (select auth.uid())
    )
    or public.has_role((select auth.uid()), 'admin')
  );

create policy "affirmation_notes: owner deletes notes"
  on public.affirmation_notes
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.affirmation_links l
      where l.id = affirmation_notes.link_id
        and l.owner_id = (select auth.uid())
    )
  );

-- No INSERT or UPDATE policy and no such grants: notes are written only by
-- submit_affirmation_note() and are never edited.

-- --------------------------------------------------------------------------
-- RPCs
-- --------------------------------------------------------------------------

-- Owner creates a link. The caller never supplies an owner or a token.
create or replace function public.create_affirmation_link(p_label text default null)
returns table (
  id uuid,
  token text,
  label text,
  is_active boolean,
  created_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_label text := nullif(btrim(coalesce(p_label, '')), '');
  v_token text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if v_label is not null and char_length(v_label) > 80 then
    raise exception 'invalid_label' using errcode = '22023';
  end if;

  -- Serialises this owner's concurrent creates so two tabs cannot both pass
  -- the cap check below and land at 21 links.
  perform pg_advisory_xact_lock(hashtextextended('affirmation_links:' || v_uid::text, 0));

  if (
    select count(*) from public.affirmation_links l where l.owner_id = v_uid
  ) >= 20 then
    raise exception 'affirmation_link_limit' using errcode = 'P0001';
  end if;

  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

  insert into public.affirmation_links as l (owner_id, token, label)
  values (v_uid, v_token, v_label)
  returning l.id, l.token, l.label, l.is_active, l.created_at
  into id, token, label, is_active, created_at;

  return next;
end;
$$;

comment on function public.create_affirmation_link(text) is
  'Creates an affirmation link owned by auth.uid() with a server-generated token. Max 20 per owner. Authenticated only.';

-- Anonymous: what the writing page needs, and nothing else. Zero rows for an
-- unknown, malformed or switched-off token -- the caller cannot tell which.
create or replace function public.get_affirmation_link_for_writing(p_token text)
returns table (
  label text,
  recipient_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return;
  end if;

  return query
    select
      l.label,
      -- Engineering Rule 16: only a name the contributor has explicitly made
      -- public. Same gates as the contributor directory (public status, a
      -- public slug, never an 'anonymous' attribution). profiles.display_name
      -- is private and never read.
      (
        select c.display_name
        from public.contributors c
        where c.linked_user_id = l.owner_id
          and c.public_status = 'public'
          and c.public_slug is not null
          and c.attribution_type <> 'anonymous'
        limit 1
      )
    from public.affirmation_links l
    where l.token = p_token
      and l.is_active
    limit 1;
end;
$$;

comment on function public.get_affirmation_link_for_writing(text) is
  'Anonymous-callable. For an ACTIVE link returns its label and the owner''s PUBLIC contributor display name (or null). Returns no rows otherwise. Never returns owner_id, email or any other field.';

-- Anonymous: leave one note on one active link.
create or replace function public.submit_affirmation_note(
  p_token text,
  p_body text,
  p_author_name text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_link_id uuid;
  v_body text := btrim(coalesce(p_body, ''));
  v_author text := nullif(btrim(coalesce(p_author_name, '')), '');
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select l.id into v_link_id
  from public.affirmation_links l
  where l.token = p_token
    and l.is_active;

  if v_link_id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  -- In-database backstop for the app's rate limit: the publishable key is
  -- public, so this function can be called directly, skipping the server
  -- action's per-IP / per-token buckets. 30 notes per link per hour matches
  -- AFFIRMATION_TOKEN_LIMIT, so it never bites before the app limit does.
  perform pg_advisory_xact_lock(hashtextextended('affirmation_notes:' || v_link_id::text, 0));

  if (
    select count(*)
    from public.affirmation_notes n
    where n.link_id = v_link_id
      and n.created_at > now() - interval '1 hour'
  ) >= 30 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  if char_length(v_body) not between 1 and 1000
     or (v_author is not null and char_length(v_author) > 60) then
    raise exception 'invalid_note' using errcode = '22023';
  end if;

  insert into public.affirmation_notes (link_id, body, author_name)
  values (v_link_id, v_body, v_author);
end;
$$;

comment on function public.submit_affirmation_note(text, text, text) is
  'Anonymous-callable. Inserts one trimmed note on the ACTIVE link with this token; raises not_found otherwise (same error for unknown and switched-off). Returns nothing.';

-- Owner reads, SECURITY INVOKER so RLS applies: the explicit owner filters
-- below are for intent, RLS is the actual boundary. "My" notes means notes
-- on MY links -- an admin's wider SELECT policy is for support, not for
-- showing other people's notes in their own inbox.
create or replace function public.list_my_affirmation_links()
returns table (
  id uuid,
  token text,
  label text,
  is_active boolean,
  created_at timestamptz,
  note_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    l.id,
    l.token,
    l.label,
    l.is_active,
    l.created_at,
    (select count(*) from public.affirmation_notes n where n.link_id = l.id)
  from public.affirmation_links l
  where l.owner_id = (select auth.uid())
  order by l.created_at desc, l.id;
$$;

comment on function public.list_my_affirmation_links() is
  'The caller''s own affirmation links, newest first, with a note count. SECURITY INVOKER -- RLS applies.';

create or replace function public.list_my_affirmation_notes(p_limit integer default 200)
returns table (
  id uuid,
  body text,
  author_name text,
  created_at timestamptz,
  link_id uuid,
  link_label text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    n.id,
    n.body,
    n.author_name,
    n.created_at,
    n.link_id,
    l.label
  from public.affirmation_notes n
  join public.affirmation_links l on l.id = n.link_id
  where l.owner_id = (select auth.uid())
  order by n.created_at desc, n.id
  limit least(greatest(coalesce(p_limit, 200), 1), 500);
$$;

comment on function public.list_my_affirmation_notes(integer) is
  'Notes left on the caller''s own links, newest first (max 500), with the link label. SECURITY INVOKER -- RLS applies.';

-- Grants: Supabase's default privileges hand EXECUTE on new public functions
-- to anon and authenticated, so each is revoked first and re-granted to
-- exactly who needs it.
revoke execute on function public.create_affirmation_link(text) from public, anon, authenticated;
grant execute on function public.create_affirmation_link(text) to authenticated;

revoke execute on function public.get_affirmation_link_for_writing(text) from public, anon, authenticated;
grant execute on function public.get_affirmation_link_for_writing(text) to anon, authenticated;

revoke execute on function public.submit_affirmation_note(text, text, text) from public, anon, authenticated;
grant execute on function public.submit_affirmation_note(text, text, text) to anon, authenticated;

revoke execute on function public.list_my_affirmation_links() from public, anon, authenticated;
grant execute on function public.list_my_affirmation_links() to authenticated;

revoke execute on function public.list_my_affirmation_notes(integer) from public, anon, authenticated;
grant execute on function public.list_my_affirmation_notes(integer) to authenticated;
