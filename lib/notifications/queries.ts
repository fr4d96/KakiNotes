import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import type {
  NotificationRow,
  NotificationsCursor,
  NotificationsPage,
} from "@/lib/notifications/notification-view";

/**
 * Rows per /notifications page, first page and every "See more" alike.
 * list_my_notifications_page() clamps p_limit to [1, 50]; the +1 below
 * (asking for one extra row to learn whether another page exists) has to
 * stay inside that, so this must be at most 49.
 */
export const NOTIFICATIONS_PAGE_SIZE = 20;

/**
 * Server-side reads for /notifications. Same contract as
 * lib/story/contributor-queries.ts: the caller is derived from the session
 * inside each function, never passed in -- the RPCs re-derive auth.uid()
 * anyway, and the getCurrentUser() check here only exists so a signed-out
 * caller gets a clean empty result instead of a raw Postgres error.
 *
 * The cast is the same one the bell makes and for the same reason:
 * `supabase gen types` marks every RETURNS TABLE column non-null, but
 * `read_at` and `reason` are genuinely nullable (null read_at IS unread).
 * See NotificationRow's own comment.
 */
export async function listMyNotificationsPage(
  cursor: NotificationsCursor | null = null,
  pageSize = NOTIFICATIONS_PAGE_SIZE,
): Promise<NotificationsPage> {
  const user = await getCurrentUser();
  if (!user) return { rows: [], nextCursor: null };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_my_notifications_page", {
    p_limit: pageSize + 1,
    p_cursor_created_at: cursor?.createdAt,
    p_cursor_id: cursor?.id,
  });
  if (error) throw error;
  const fetched = (data ?? []) as NotificationRow[];
  const rows = fetched.slice(0, pageSize);
  const last = rows.at(-1);
  return {
    rows,
    nextCursor:
      fetched.length > pageSize && last
        ? { createdAt: last.created_at, id: last.id }
        : null,
  };
}

/**
 * The caller's unread total across the whole inbox, not just loaded pages:
 * "Mark all as read" acts on every row, so the summary next to it counts
 * every row too.
 */
export async function countMyUnreadNotifications(): Promise<number> {
  const user = await getCurrentUser();
  if (!user) return 0;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("count_my_unread_notifications");
  if (error) throw error;
  return typeof data === "number" ? data : 0;
}
