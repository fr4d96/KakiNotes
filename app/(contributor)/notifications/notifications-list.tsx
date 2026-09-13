"use client";

import { useActionState, useEffect } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  describeNotification,
  type NotificationRow,
} from "@/lib/notifications/notification-view";
import { formatRelativeTime } from "@/lib/i18n/format";
import { isLocale } from "@/i18n/locales";
import { NOTIFICATIONS_CHANGED_EVENT } from "@/lib/notifications/notifications-changed";
import { markNotificationsReadAction } from "./actions";

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
 */
export function NotificationsList({
  notifications,
  now,
}: {
  notifications: NotificationRow[];
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

  const items = notifications.map(describeNotification);
  const unreadCount = items.filter((item) => item.unread).length;
  const nowDate = now ? new Date(now) : undefined;

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
            ? t("unreadOf", { unread: unreadCount, total: items.length })
            : t("allRead", { count: items.length })}
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

      <ul className="mt-6 flex flex-col gap-3">
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
    </>
  );
}
