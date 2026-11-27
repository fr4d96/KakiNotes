-- Notifications inbox: keyset pagination for /notifications.
--
-- list_my_notifications(p_limit) returns the newest rows only, clamped to
-- 50, with no way to ask for the next ones. /notifications showed those 50
-- and nothing older was reachable anywhere. This adds a SEPARATE function
-- that takes a (created_at, id) cursor, the same shape
-- list_published_stories() uses (p_cursor_published_at, p_cursor_id).
--
-- ADDITIVE ON PURPOSE. list_my_notifications(integer) is untouched: the
-- header bell calls it, and so does the release currently deployed from
-- `release`. This project is also production, so a reshape of that function
-- would break the live site until the next release ships. It can be dropped
-- in a later migration once nothing calls it.
--
-- Same security model as the original (20260911100000): SECURITY DEFINER,
-- keyed on auth.uid() inside the function, table grants stay revoked. The
-- cursor is only a position in the caller's OWN rows -- a cursor copied
-- from someone else's inbox selects nothing extra, because the
-- recipient_user_id = auth.uid() filter is applied first and the cursor
-- only narrows it.
--
-- Cursor contract: both halves or neither. Exactly one given returns no
-- rows rather than guessing (a row comparison against a null half is null,
-- which would silently drop rows at the boundary).

create function public.list_my_notifications_page(
  p_limit integer default 20,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null
)
returns table (
  id uuid,
  kind public.notification_kind,
  story_id uuid,
  revision_id uuid,
  story_title text,
  story_slug text,
  reason text,
  read_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, n.kind, n.story_id, n.revision_id, n.story_title, n.story_slug,
         n.reason, n.read_at, n.created_at
  from public.notifications n
  where n.recipient_user_id = auth.uid()
    and (p_cursor_created_at is null) = (p_cursor_id is null)
    and (
      p_cursor_created_at is null
      or (n.created_at, n.id) < (p_cursor_created_at, p_cursor_id)
    )
  order by n.created_at desc, n.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

comment on function public.list_my_notifications_page(integer, timestamptz, uuid) is
  'The caller''s own inbox, newest first, one page at a time. Pass the last row''s (created_at, id) as the cursor to get the rows after it; both or neither. p_limit clamped to [1, 50]. Signed-out callers get no rows.';

revoke all on function public.list_my_notifications_page(integer, timestamptz, uuid) from public, anon;
grant execute on function public.list_my_notifications_page(integer, timestamptz, uuid) to authenticated;

-- The old index orders by created_at only. Adding id lets the row
-- comparison and the (created_at desc, id desc) sort both come straight
-- off the index, ties included. It still serves list_my_notifications().
create index notifications_recipient_created_id_idx
  on public.notifications (recipient_user_id, created_at desc, id desc);
drop index public.notifications_recipient_created_idx;
