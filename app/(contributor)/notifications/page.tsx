import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import {
  listMyNotifications,
  NOTIFICATIONS_PAGE_LIMIT,
} from "@/lib/notifications/queries";
import { NotificationsList } from "./notifications-list";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("notifications");
  return { title: t("metaTitle") };
}

export default async function NotificationsPage() {
  const [notifications, t] = await Promise.all([
    listMyNotifications(),
    getTranslations("notifications"),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="journiq-heading text-[2.4rem]">{t("title")}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t("intro")}</p>

      <div className="mt-8">
        {/*
          `now` is passed from the server so relativeTime() renders the same
          string in the server HTML and the client hydration. Letting the
          Client Component call new Date() itself would make "12 min ago"
          a hydration mismatch on any request slow enough to cross a minute
          boundary.
        */}
        <NotificationsList
          notifications={notifications}
          now={new Date().toISOString()}
        />
      </div>

      {notifications.length === NOTIFICATIONS_PAGE_LIMIT && (
        <p className="mt-8 text-center text-xs text-muted-foreground">
          Showing your {NOTIFICATIONS_PAGE_LIMIT} most recent notifications.
        </p>
      )}
    </div>
  );
}
