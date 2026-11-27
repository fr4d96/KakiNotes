"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  describeNotification,
  mergeNotificationRows,
  type NotificationRow,
  type NotificationsPage,
} from "@/lib/notifications/notification-view";
import { formatRelativeTime } from "@/lib/i18n/format";
import { isLocale } from "@/i18n/locales";
import { NOTIFICATIONS_CHANGED_EVENT } from "@/lib/notifications/notifications-changed";
import {
  loadMoreNotificationsAction,
  markNotificationsReadAction,
} from "./actions";

/**
 * The /notifications list. Takes rows, not a fetch -- the page owns the
 * read, this owns the rendering, same split every other view component in
 * the app uses (MyStoriesView, the moderation queue).
 *
 * `formatRelativeTime` (lib/i18n/format.ts) rather than the bell's
 * formatNotificationAge(): a dropdown needs "12m" because it has ~40px to
 * spend, a full page can afford "12 min ago". That helper is the
 * locale-aware sibling of lib/story/moderation-queue-view.ts's
 * relativeTime(), which the staff queue still uses and whose English
 * phrasing it matches exactly.
 *
 * A Client Component only for useActionState's pending/error state. The
 * forms themselves are real <form action={...}> submits, so the page still
 * works with JavaScript off -- which is why marking read here goes through
 * a Server Action instead of the client-side RPC the bell uses. The action
 * revalidates this path, so the list re-renders from the database rather
 * than from optimistic local state; on a full page, being right matters
 * more than being instant.
 *
 * "See more" pages from the server: list_my_notifications_page() takes the
 * last shown row's (created_at, id) and returns the rows after it, so the
 * whole inbox is reachable, not just the newest 50.
 */
export function NotificationsList({
  initialPage,
  unreadCount,
  now,
}: {
  /** Page one, from the page's own read. Replaced on every revalidation. */
  initialPage: NotificationsPage;
  /** Across the whole inbox, not just loaded rows -- see countMyUnreadNotifications. */
  unreadCount: number;
  /** Injected by the page so the server and client agree on "now" -- see its comment. */
  now?: string;
}) {
  const t = useTranslations("notifications");
  const tRelative = useTranslations("common.relativeTime");
  const rawLocale = useLocale();
  const locale = isLocale(rawLocale) ? rawLocale : "en";
  const [state, formAction, pending] = useActionState(
    markNotificationsReadAction,
    {},
  );
  // Tell the header bell to re-count. Keyed on state.markedAt, which
  // changes once per successful action -- see MarkReadState's comment.
  useEffect(() => {
    if (!state.markedAt) return;
    window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
  }, [state.markedAt]);

  const [rows, setRows] = useState<NotificationRow[]>(initialPage.rows);
  const [nextCursor, setNextCursor] = useState(initialPage.nextCursor);
  const [loadedMore, setLoadedMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [loadingMore, startLoadingMore] = useTransition();

  // A mark-read revalidates the page, which hands down a NEW page one.
  // Merge it in rather than replacing: older pages the reader already
  // loaded stay, and a row a newer notification pushed off page one is
  // kept too (mergeNotificationRows). Adjusting state while rendering,
  // keyed on the prop's identity, is React's pattern for this.
  const [seenPage, setSeenPage] = useState(initialPage);
  if (initialPage !== seenPage) {
    setSeenPage(initialPage);
    setRows((prev) => mergeNotificationRows(initialPage.rows, prev));
    if (!loadedMore) setNextCursor(initialPage.nextCursor);
  }

  // The revalidated page one carries fresh read_at, but rows from older
  // pages do not -- mark those here from what the action reports it did.
  const [seenMarkedAt, setSeenMarkedAt] = useState(state.markedAt);
  if (state.markedAt !== seenMarkedAt) {
    setSeenMarkedAt(state.markedAt);
    const marked = state.markedIds ?? [];
    const markedAt = state.markedAt ?? null;
    setRows((prev) =>
      prev.map((row) =>
        row.read_at === null && (marked.length === 0 || marked.includes(row.id))
          ? { ...row, read_at: markedAt }
          : row,
      ),
    );
  }

  const items = rows.map(describeNotification);
  const nowDate = now ? new Date(now) : undefined;
  const hasMore = nextCursor !== null;

  // Set on "See more"; the effect below moves focus there only if the
  // button vanished with that click, so keyboard focus never drops to <body>.
  const focusIndexRef = useRef<number | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const index = focusIndexRef.current;
    if (index === null || loadingMore) return;
    focusIndexRef.current = null;
    if (hasMore) return;
    listRef.current
      ?.querySelectorAll<HTMLAnchorElement>("[data-notification-link]")
      [index]?.focus();
  }, [rows.length, hasMore, loadingMore]);

  function seeMore() {
    if (!nextCursor || loadingMore) return;
    const cursor = nextCursor;
    const firstNewIndex = rows.length;
    setLoadError(null);
    startLoadingMore(async () => {
      const result = await loadMoreNotificationsAction(cursor);
      if ("error" in result) {
        setLoadError(t("loadMoreFailed"));
        return;
      }
      focusIndexRef.current = firstNewIndex;
      setRows((prev) => mergeNotificationRows(result.rows, prev));
      setNextCursor(result.nextCursor);
      setLoadedMore(true);
      setAnnouncement(t("loadedMore", { count: result.rows.length }));
    });
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-border-subtle bg-surface p-10 text-center shadow-sm">
        <p className="text-lg font-bold">{t("emptyTitle")}</p>
        <p className="mt-2 text-sm text-muted-foreground">{t("emptyBody")}</p>
        <Link
          href="/my-stories"
          className="mt-6 inline-block rounded-full border border-border-subtle px-4 py-2 text-sm font-bold hover:bg-surface-muted"
        >
          {t("goToMyStories")}
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {unreadCount > 0
            ? t("unreadCount", { count: unreadCount })
            : t("noneUnread")}
        </p>
        {unreadCount > 0 && (
          <form action={formAction}>
            {/* No notificationId inputs: an empty list means "all of mine",
                which is the RPC's own null default. */}
            <button
              type="submit"
              disabled={pending}
              className="rounded-full border border-border-subtle px-4 py-2 text-sm font-bold hover:bg-surface-muted disabled:opacity-60"
            >
              {pending ? t("marking") : t("markAllAsRead")}
            </button>
          </form>
        )}
      </div>

      {state.error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {state.error}
        </p>
      )}

      <ul ref={listRef} className="mt-6 flex flex-col gap-3">
        {items.map((item) => (
          <li
            key={item.id}
            className={`rounded-xl border bg-surface p-4 shadow-sm sm:p-5 ${
              item.unread ? "border-accent/40" : "border-border-subtle"
            }`}
          >
            <div className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className={`mt-2 h-2 w-2 shrink-0 rounded-full ${item.unread ? "bg-accent" : "bg-transparent"}`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <Link
                    data-notification-link
                    href={item.href}
                    className={`text-base hover:underline ${item.unread ? "font-black" : "font-bold"}`}
                  >
                    {t(`kinds.${item.headingKey}`)}
                    {item.unread && (
                      <span className="sr-only">{t("unreadSuffix")}</span>
                    )}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {formatRelativeTime(
                      item.createdAt,
                      locale,
                      tRelative,
                      nowDate,
                    )}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  &ldquo;{item.title}&rdquo;
                </p>
                {item.reason && (
                  <p className="mt-2 rounded-lg bg-surface-muted p-3 text-sm">
                    {item.reason}
                  </p>
                )}
              </div>
              {item.unread && (
                <form action={formAction} className="shrink-0">
                  <input type="hidden" name="notificationId" value={item.id} />
                  <button
                    type="submit"
                    disabled={pending}
                    className="rounded-full border border-border-subtle px-3 py-1.5 text-xs font-bold hover:bg-surface-muted disabled:opacity-60"
                  >
                    {t("markRead")}
                  </button>
                </form>
              )}
            </div>
          </li>
        ))}
      </ul>

      {loadError && (
        <p role="alert" className="mt-4 text-center text-sm text-destructive">
          {loadError}
        </p>
      )}

      {hasMore && (
        <div className="mt-6 flex justify-center">
          {/* aria-disabled, not disabled: a disabled button drops focus,
              and the keyboard user who pressed it would land on <body>. */}
          <button
            type="button"
            onClick={seeMore}
            aria-disabled={loadingMore}
            className="min-h-11 rounded-full border border-border-subtle px-5 py-2 text-sm font-bold hover:bg-surface-muted aria-disabled:opacity-60"
          >
            {loadingMore ? t("loadingMore") : t("seeMore")}
          </button>
        </div>
      )}

      {/* Always mounted so the first announcement is not missed. */}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </>
  );
}
