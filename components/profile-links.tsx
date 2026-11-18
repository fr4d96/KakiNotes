"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { signOutAction } from "@/app/(auth)/actions";
import { authoringMenuItems } from "@/components/auth/user-avatar-menu";
import { ChevronIcon } from "@/components/icons";
import { useViewerIdentity } from "@/lib/auth/viewer-identity";
import { staffMenuItemsForRole } from "@/lib/auth/staff-menu";
import { countryUrlPrefix } from "@/lib/story/countries";
import { useCurrentCountry } from "@/lib/story/use-current-country";

/**
 * The phone's profile screen (/settings, opened from the Profile tab in
 * components/bottom-tab-bar.tsx since 2026-11-18): everything the header's
 * avatar menu used to hold on a phone, as grouped rows above the device
 * preferences. In order: the viewer's staff surfaces, their own places
 * (My Photos, Affirmation notes -- My Stories and New Story have their own
 * tab and header button), Account and Notifications, then About. Sign out
 * closes the whole screen (ProfileSignOut, below the preferences).
 *
 * Phones only (md:hidden): from md up the header keeps its avatar menu.
 * Signed out it renders nothing -- Settings stays the plain preferences page
 * it was. Like UserAvatarMenu the role is PRESENTATION ONLY
 * (lib/auth/staff-menu.ts): every link is still guarded by proxy.ts, the
 * route group's layout and RLS.
 */
export function ProfileLinks() {
  const t = useTranslations("nav");
  const viewer = useViewerIdentity();
  const aboutHref = `${countryUrlPrefix(useCurrentCountry())}/about`;
  if (viewer.status !== "signed-in") return null;

  const staff = staffMenuItemsForRole(viewer.role);
  const own = authoringMenuItems(viewer.role)
    .filter((item) => item.key === "myPhotos" || item.key === "affirmations")
    .map((item) => ({ href: item.href, label: t(item.key) }));
  const account = [
    { href: "/account", label: t("account") },
    { href: "/notifications", label: t("notifications") },
  ];
  const groups = [
    ...(staff.length > 0 ? [{ heading: t("staff"), items: staff }] : []),
    ...(own.length > 0 ? [{ heading: null, items: own }] : []),
    { heading: null, items: account },
    { heading: null, items: [{ href: aboutHref, label: t("about") }] },
  ];

  return (
    <nav
      aria-label={t("profileLinks")}
      className="flex flex-col gap-4 md:hidden"
    >
      {groups.map((group, index) => (
        <div key={index}>
          {group.heading && (
            <h2 className="px-1 pb-2 text-sm font-bold text-muted-foreground">
              {group.heading}
            </h2>
          )}
          <ul className="divide-y divide-border-subtle overflow-hidden rounded-2xl bg-surface shadow-sm">
            {group.items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="press flex min-h-12 items-center justify-between gap-3 px-4 text-base font-medium active:bg-surface-muted"
                >
                  {item.label}
                  <ChevronIcon
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 text-muted-foreground"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Sign out, last on the phone's profile screen (signed in only). */
export function ProfileSignOut() {
  const t = useTranslations("nav");
  const viewer = useViewerIdentity();
  if (viewer.status !== "signed-in") return null;
  return (
    <form action={signOutAction} className="md:hidden">
      <button
        type="submit"
        className="press flex min-h-12 w-full items-center justify-center rounded-2xl bg-surface text-base font-bold text-destructive shadow-sm active:bg-surface-muted"
      >
        {t("signOut")}
      </button>
    </form>
  );
}
