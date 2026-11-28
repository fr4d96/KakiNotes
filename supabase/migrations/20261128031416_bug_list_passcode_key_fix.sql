-- Fix for 20261128030826_bug_list_passcode: its failure counter wrote the
-- key 'global' into public.rate_limits, whose rate_limits_key_hash_format
-- check requires 64 hex characters. A wrong password therefore raised a
-- check violation instead of returning {ok:false, reason:'invalid'} (and
-- nothing was counted). The key is now sha256('bug_list_passcode:global')
-- in hex. Function body otherwise unchanged; grants re-stated.

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
  -- rate_limits.key_hash must be 64 hex chars (rate_limits_key_hash_format).
  v_key constant text := encode(sha256(convert_to('bug_list_passcode:global', 'UTF8')), 'hex');
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
  where r.scope = 'bug_list_passcode' and r.key_hash = v_key;

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
    values ('bug_list_passcode', v_key, now(), 1)
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
