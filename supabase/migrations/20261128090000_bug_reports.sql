-- Bug reports: anyone using the app (signed in or not) can describe a bug
-- from the "Report a bug" dialog; the owner reviews the list and decides
-- which to fix. RECORDING ONLY -- nothing here triggers any fix, job or
-- notification.
--
-- THE SHAPE, and why (same posture as 20261031084021_affirmation_notes):
--
-- * Insertion is RPC-only: submit_bug_report() is SECURITY DEFINER and
--   anon/authenticated hold no INSERT grant on the table. The publishable key
--   is public, so a table INSERT policy would let anyone skip the server
--   action's per-IP rate limit with a plain REST call. The function is the
--   in-database backstop: it caps reports per signed-in reporter and, for
--   signed-out visitors, overall, which an RLS policy cannot do (a policy's
--   subquery runs under the caller's RLS and could not count rows the caller
--   cannot see).
--
-- * reporter_id comes ONLY from auth.uid() inside the function (Engineering
--   Rule 2). The caller never sends it. Signed-out reports have reporter_id
--   null.
--
-- * status is never set by a reporter: the function always inserts 'open'.
--
-- * Reading and triage are ADMIN-ONLY. Reports carry a user agent and, for
--   signed-in reporters, an account id -- not something editors or
--   moderators need. Admins may UPDATE the status column only (column-level
--   grant), so the report text itself can never be rewritten.
--
-- * Plain text only. Nothing renders a description as HTML (Rule 7).

-- --------------------------------------------------------------------------
-- Rate-limit scopes (closed list, see 20260909130000). Same list as the
-- hosted project had on 2026-11-28, plus the two bug-report buckets.
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
      'bug_report_ip', 'bug_report_user'
    )
  );

comment on constraint rate_limits_scope_known on public.rate_limits is
  'Closed list on purpose: a typo in a scope name should fail loudly, not silently create an empty bucket that limits nothing. Buckets are per-surface so none can spend another''s allowance. bug_report_ip / bug_report_user throttle the Report a bug dialog.';

-- --------------------------------------------------------------------------
-- bug_reports
-- --------------------------------------------------------------------------

create table public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references auth.users (id) on delete set null,
  description text not null,
  page_path text,
  user_agent text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bug_reports_description_length
    check (char_length(btrim(description)) between 10 and 2000),
  constraint bug_reports_page_path_shape
    check (page_path is null or (page_path like '/%' and char_length(page_path) <= 500)),
  constraint bug_reports_user_agent_length
    check (user_agent is null or char_length(user_agent) <= 500),
  constraint bug_reports_status_known
    check (status in ('open', 'triaged', 'fixed', 'wontfix'))
);

comment on table public.bug_reports is
  'Bug reports from the Report a bug dialog. Written ONLY by submit_bug_report(); readable and status-updatable by admins only. Recording only: nothing acts on a row automatically.';
comment on column public.bug_reports.reporter_id is
  'auth.uid() of a signed-in reporter, taken inside submit_bug_report(); null for signed-out visitors or a deleted account.';
comment on column public.bug_reports.page_path is
  'Pathname the reporter was on (no query string or hash; capability tokens redacted by the app).';

create index bug_reports_created_at_idx on public.bug_reports (created_at desc);
create index bug_reports_reporter_created_idx
  on public.bug_reports (reporter_id, created_at)
  where reporter_id is not null;

create trigger bug_reports_set_updated_at
  before update on public.bug_reports
  for each row
  execute function public.set_updated_at();

alter table public.bug_reports enable row level security;

revoke all on public.bug_reports from public, anon, authenticated;
grant select on public.bug_reports to authenticated;
grant update (status) on public.bug_reports to authenticated;

create policy "bug_reports: admin reads all"
  on public.bug_reports
  for select
  to authenticated
  using (public.has_role((select auth.uid()), 'admin'));

create policy "bug_reports: admin updates status"
  on public.bug_reports
  for update
  to authenticated
  using (public.has_role((select auth.uid()), 'admin'))
  with check (public.has_role((select auth.uid()), 'admin'));

-- No INSERT or DELETE policy and no such grants.

-- --------------------------------------------------------------------------
-- submit_bug_report()
-- --------------------------------------------------------------------------

create or replace function public.submit_bug_report(
  p_description text,
  p_page_path text default null,
  p_user_agent text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_description text := btrim(coalesce(p_description, ''));
  v_path text := nullif(btrim(coalesce(p_page_path, '')), '');
  v_agent text := left(nullif(btrim(coalesce(p_user_agent, '')), ''), 500);
begin
  if char_length(v_description) not between 10 and 2000
     or (v_path is not null and (v_path not like '/%' or char_length(v_path) > 500)) then
    raise exception 'invalid_bug_report' using errcode = '22023';
  end if;

  -- In-database backstop for the app's rate limit (the publishable key is
  -- public, so this can be called directly). Never bites before the app's
  -- own limits do for a real person.
  if v_uid is not null then
    perform pg_advisory_xact_lock(hashtextextended('bug_reports:' || v_uid::text, 0));
    if (
      select count(*) from public.bug_reports b
      where b.reporter_id = v_uid
        and b.created_at > now() - interval '1 hour'
    ) >= 10 then
      raise exception 'rate_limited' using errcode = 'P0001';
    end if;
  else
    perform pg_advisory_xact_lock(hashtextextended('bug_reports:anon', 0));
    if (
      select count(*) from public.bug_reports b
      where b.reporter_id is null
        and b.created_at > now() - interval '1 hour'
    ) >= 60 then
      raise exception 'rate_limited' using errcode = 'P0001';
    end if;
  end if;

  insert into public.bug_reports (reporter_id, description, page_path, user_agent)
  values (v_uid, v_description, v_path, v_agent);
end;
$$;

comment on function public.submit_bug_report(text, text, text) is
  'Anon- and authenticated-callable. Inserts one open bug report; reporter_id is auth.uid() (null when signed out). Caps: 10/hour per signed-in reporter, 60/hour across all signed-out reports. Returns nothing.';

revoke execute on function public.submit_bug_report(text, text, text) from public, anon, authenticated;
grant execute on function public.submit_bug_report(text, text, text) to anon, authenticated;
