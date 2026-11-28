-- Bug Lists: a password-protected, READ-ONLY view of the bug reports, opened
-- from a "Bug Lists" button anyone can see (OWNER DECISION 2026-11-28: the
-- owner chose a shared password over admin sign-in, so he can check the list
-- from any phone).
--
-- THE SHAPE, and why:
--
-- * bug_reports' RLS is NOT changed: it stays admin-only. The only new way
--   in is list_bug_reports_with_passcode(), a SECURITY DEFINER function that
--   returns a fixed, narrow shape -- id, description, page path, status,
--   created_at -- and NEVER reporter_id or user_agent. Knowing the password
--   reveals what was reported, not who reported it or from what device.
--
-- * The app's service-role key is NOT used: it stays reserved for the image
--   pipeline (eslint no-restricted-imports).
--
-- * The password is stored only as a bcrypt hash (pgcrypto crypt/gen_salt)
--   in public.bug_list_access, a one-row table with RLS on and every grant
--   revoked. This file creates the table EMPTY; the hash is set separately
--   with execute_sql so the password never appears in the repository. With
--   no row, the function answers 'not_configured' and reveals nothing.
--
-- * Wrong guesses are throttled IN THE DATABASE, because the publishable key
--   is public and the function can be called directly: after 30 wrong
--   passwords in 15 minutes (from anyone, counted in public.rate_limits
--   under scope 'bug_list_passcode'), every call is refused until the window
--   ends -- even with the right password -- so guessing cannot continue.
--   The app adds a per-IP limit in front (scope 'bug_list_ip').
--
-- * Failures are RETURNED, never raised: a raised exception would roll back
--   the failure counter it just wrote.

-- --------------------------------------------------------------------------
-- Rate-limit scopes (closed list, see 20260909130000).
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
      'maps_link_user',
      'affirmation_ip', 'affirmation_token',
      'bug_report_ip', 'bug_report_user',
      'bug_list_ip', 'bug_list_passcode'
    )
  );

comment on constraint rate_limits_scope_known on public.rate_limits is
  'Closed list on purpose: a typo in a scope name should fail loudly, not silently create an empty bucket that limits nothing. Buckets are per-surface so none can spend another''s allowance. bug_list_ip / bug_list_passcode throttle wrong Bug Lists passwords.';

-- --------------------------------------------------------------------------
-- bug_list_access: the one password hash
-- --------------------------------------------------------------------------

create table public.bug_list_access (
  id boolean primary key default true,
  passcode_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bug_list_access_single_row check (id)
);

comment on table public.bug_list_access is
  'One row: the bcrypt hash of the Bug Lists password. Read only by list_bug_reports_with_passcode(). Set or change it with: insert into public.bug_list_access (passcode_hash) values (extensions.crypt(<password>, extensions.gen_salt(''bf''))) on conflict (id) do update set passcode_hash = excluded.passcode_hash; -- run by hand, never committed.';

create trigger bug_list_access_set_updated_at
  before update on public.bug_list_access
  for each row
  execute function public.set_updated_at();

alter table public.bug_list_access enable row level security;
revoke all on public.bug_list_access from public, anon, authenticated;
-- No policies and no grants: nothing but the definer function reads it.

-- --------------------------------------------------------------------------
-- list_bug_reports_with_passcode()
-- --------------------------------------------------------------------------

create or replace function public.list_bug_reports_with_passcode(p_passcode text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_hash text;
  v_window constant integer := 15 * 60;
  v_limit constant integer := 30;
  v_row public.rate_limits%rowtype;
  v_retry integer;
begin
  select a.passcode_hash into v_hash
  from public.bug_list_access a
  where a.id;

  if v_hash is null then
    return jsonb_build_object('ok', false, 'reason', 'not_configured');
  end if;

  -- Serialise checks so concurrent guesses can't all slip under the cap.
  perform pg_advisory_xact_lock(hashtextextended('bug_list_passcode', 0));

  select * into v_row
  from public.rate_limits r
  where r.scope = 'bug_list_passcode' and r.key_hash = 'global';

  if found
     and now() < v_row.window_started_at + make_interval(secs => v_window)
     and v_row.attempt_count >= v_limit then
    v_retry := greatest(1, ceil(extract(epoch from (
      v_row.window_started_at + make_interval(secs => v_window) - now()
    ))))::integer;
    return jsonb_build_object(
      'ok', false, 'reason', 'rate_limited', 'retry_after_seconds', v_retry
    );
  end if;

  if p_passcode is null
     or char_length(p_passcode) not between 1 and 200
     or extensions.crypt(p_passcode, v_hash) <> v_hash then
    insert into public.rate_limits as r
      (scope, key_hash, window_started_at, attempt_count)
    values ('bug_list_passcode', 'global', now(), 1)
    on conflict (scope, key_hash) do update
      set window_started_at = case
            when now() >= r.window_started_at + make_interval(secs => v_window)
              then now()
            else r.window_started_at
          end,
          attempt_count = case
            when now() >= r.window_started_at + make_interval(secs => v_window)
              then 1
            else r.attempt_count + 1
          end;
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  return jsonb_build_object(
    'ok', true,
    'reports', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', b.id,
          'description', b.description,
          'page_path', b.page_path,
          'status', b.status,
          'created_at', b.created_at
        )
        order by b.created_at desc
      )
      from (
        select * from public.bug_reports
        order by created_at desc
        limit 200
      ) b
    ), '[]'::jsonb)
  );
end;
$$;

comment on function public.list_bug_reports_with_passcode(text) is
  'Anon- and authenticated-callable. With the right Bug Lists password, returns {ok:true, reports:[{id, description, page_path, status, created_at}]} (newest 200; never reporter_id or user_agent). Otherwise {ok:false, reason: invalid | rate_limited | not_configured}. 30 wrong passwords in 15 minutes locks it for everyone until the window ends.';

revoke execute on function public.list_bug_reports_with_passcode(text) from public, anon, authenticated;
grant execute on function public.list_bug_reports_with_passcode(text) to anon, authenticated;
