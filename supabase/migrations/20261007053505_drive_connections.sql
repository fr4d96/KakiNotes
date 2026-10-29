-- Google Drive connection, slice 1 (connect/disconnect only — see
-- docs/google-drive-integration.md section 11, slice 1). No image upload or
-- read behavior changes with this migration; no column here is read by any
-- existing query.
--
-- ACCESS MODEL
--
-- This table holds a secret (the encrypted refresh token) and nothing about
-- it is safe to expose wholesale, even to its own owner, over a normal
-- RLS-scoped policy — a policy only controls which ROWS a role can see, not
-- which COLUMNS, and there is no row-visible shape of this table that both
-- includes encrypted_refresh_token and is safe for the browser to fetch
-- directly. So: RLS enabled, zero policies for anon/authenticated (enabling
-- RLS with no policies denies every row to those roles by default — same
-- pattern as notifications/contributors-adjacent tables), and table
-- privileges explicitly revoked from anon/authenticated too, belt and
-- braces. service_role (lib/drive/token-store.ts, the ONLY module allowed
-- to import lib/supabase/admin.ts for this table — see eslint.config.mjs)
-- bypasses RLS and is how the server reads/writes it at all.
--
-- The one thing a signed-in contributor IS allowed to see about their own
-- connection — whether it exists, the Google account email, when it was
-- made — is exposed through get_my_drive_connection_status() below, a
-- SECURITY DEFINER function that returns exactly those three columns and
-- nothing else. It can never be made to return encrypted_refresh_token,
-- iv, auth_tag, or encryption_key_version, because the function's RETURNS
-- TABLE simply does not have those columns.
--
-- Deliberately its own table, not a column on profiles/contributors
-- (Engineering Rule 4): this is protected integration state, not
-- user-editable profile data, and it carries a secret the profiles/
-- contributors tables must never be shaped to hold.

create table public.contributor_drive_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,

  -- AES-256-GCM, encrypted/decrypted only inside lib/drive/token-store.ts.
  -- iv is random per encryption (12 bytes, the standard GCM nonce size);
  -- auth_tag is GCM's own tamper-detection tag, stored separately from the
  -- ciphertext so a flipped bit anywhere fails authentication rather than
  -- silently decrypting to garbage. encryption_key_version is carried so a
  -- future key rotation can re-encrypt existing rows under a new key
  -- without losing track of which rows are still under the old one.
  --
  -- Stored as base64 TEXT, not bytea, on purpose: token-store.ts writes and
  -- reads these through PostgREST as JSON strings. A base64 string sent to a
  -- bytea column is stored as the bytes of its ASCII characters and comes
  -- back as a \x-prefixed hex string, so a bytea round trip would never
  -- decrypt. The CHECKs keep anything that isn't base64 out.
  encrypted_refresh_token text not null
    check (encrypted_refresh_token ~ '^[A-Za-z0-9+/]+={0,2}$'),
  token_iv text not null
    check (token_iv ~ '^[A-Za-z0-9+/]+={0,2}$'),
  token_auth_tag text not null
    check (token_auth_tag ~ '^[A-Za-z0-9+/]+={0,2}$'),
  encryption_key_version smallint not null default 1,

  -- Display-only. Never used for authorization — the row's identity is
  -- user_id, re-derived server-side from the session on every request
  -- (Engineering Rule 2), never from these columns or from anything the
  -- client sends.
  google_account_email text,
  google_account_sub text,

  -- Nullable: slice 1 never creates a Drive folder (no image has touched
  -- Drive yet). A later slice (section 4 of the design doc) sets this once
  -- the app creates its per-contributor folder.
  drive_folder_id text,

  status text not null default 'active'
    check (status in ('active', 'revoked', 'refresh_failed')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.contributor_drive_connections is
  'One row per contributor who has linked Google Drive. Holds the encrypted refresh token. Server-only: no client (anon or authenticated) has any access — see RLS/grants below. Read via get_my_drive_connection_status() only, which never exposes a token column. Separate from profiles/contributors per Engineering Rule 4.';

create trigger contributor_drive_connections_set_updated_at
  before update on public.contributor_drive_connections
  for each row
  execute function public.set_updated_at();

alter table public.contributor_drive_connections enable row level security;

-- No policies created for anon/authenticated on purpose: RLS enabled with
-- zero policies denies every row to those roles by default. The explicit
-- revokes below are redundant with that default but make the intent
-- impossible to miss in a future review.
revoke all on public.contributor_drive_connections from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The one read: the caller's own non-secret status
-- ---------------------------------------------------------------------------

create or replace function public.get_my_drive_connection_status()
returns table (
  connected boolean,
  google_account_email text,
  connected_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    true as connected,
    c.google_account_email,
    c.created_at as connected_at
  from public.contributor_drive_connections c
  where c.user_id = auth.uid()
    and c.status = 'active';
$$;

comment on function public.get_my_drive_connection_status() is
  'The caller''s own Drive connection status only (auth.uid()) — connected?, display email, connected-at. Never returns a token column; those columns are not in this function''s result shape at all. Signed-out callers and callers with no active connection get zero rows.';

revoke all on function public.get_my_drive_connection_status() from public, anon;
grant execute on function public.get_my_drive_connection_status() to authenticated;
