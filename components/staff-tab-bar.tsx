"use client";

import type { ComponentType, SVGProps } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  AlertCircleIcon,
  ConsentCheckIcon,
  ContributorIcon,
  EditorialPencilIcon,
  HiddenEyeIcon,
  HomeIcon,
  ModerationQueueIcon,
  PlusIcon,
  UsersIcon,
} from "@/components/icons";
import { ScrollToTopButton } from "@/components/scroll-to-top-button";
import { useTextEntryFocus } from "@/components/use-text-entry-focus";
import {
  activeStaffHref,
  type StaffNavIcon,
  type StaffNavLink,
} from "@/components/staff-nav-links";
import { useViewerIdentity } from "@/lib/auth/viewer-identity";
import { isWithin, showsTabBar } from "@/lib/navigation/app-chrome";
import { MODERATION_LINKS } from "@/lib/navigation/moderation-links";

const ICONS: Record<StaffNavIcon, ComponentType<SVGProps<SVGSVGElement>>> = {
  overview: HomeIcon,
  stories: ModerationQueueIcon,
  reports: AlertCircleIcon,
  takedowns: HiddenEyeIcon,
  readiness: ConsentCheckIcon,
  users: UsersIcon,
  editorial: EditorialPencilIcon,
  new: PlusIcon,
};

/**
 * A staff dashboard's sections on a phone: the same floating glass bar the
 * contributor has (components/bottom-tab-bar.tsx), sharing its classes --
 * glass, sliding bubble, icon pop, reduced-motion rules -- so the two can't
 * look different. It slides away while a field has focus, for the same
 * reason: it must never float above the iOS keyboard. A selection bar on the
 * page (data-selection-bar, the queue's select mode) takes its place; that,
 * and the space the page leaves for it, are in globals.css.
 *
 * Simpler than the contributor's on purpose: no remembered place per tab.
 * A queue should open fresh, not where it was left an hour ago.
 */
export function StaffTabBar({
  label,
  links,
  profileTab = false,
}: {
  label: string;
  links: StaffNavLink[];
  /** End with the viewer's own tab, as the contributor's bar does. */
  profileTab?: boolean;
}) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const typing = useTextEntryFocus();
  const viewer = useViewerIdentity();

  const active = activeStaffHref(links, pathname);
  const tabs = [
    ...links
      .filter((link) => !link.headerOnly)
      .map((link) => ({
        href: link.href,
        label: link.label,
        ariaLabel: undefined as string | undefined,
        Icon: ICONS[link.icon],
        emoji: null as string | null,
        current: link.href === active,
      })),
    ...(profileTab
      ? [
          {
            href: PROFILE_HREF,
            label: viewer.name ?? t("profile"),
            ariaLabel: viewer.name
              ? `${t("profile")}, ${viewer.name}`
              : undefined,
            Icon: ContributorIcon,
            emoji: viewer.avatarEmoji,
            // Readiness is reached from the You page, so it lights Profile.
            current: PROFILE_PATHS.some((path) => isWithin(pathname, path)),
          },
        ]
      : []),
  ];
  const activeIndex = tabs.findIndex((tab) => tab.current);

  return (
    <nav
      aria-label={label}
      data-hidden={typing ? "true" : "false"}
      inert={typing}
      className="nf-tab-bar nf-staff-tab-bar nf-glass fixed right-[max(0.75rem,env(safe-area-inset-right))] bottom-(--tab-bar-gap) left-[max(0.75rem,env(safe-area-inset-left))] z-40 rounded-full p-1 text-foreground md:hidden print:hidden"
    >
      <div className="relative">
        <span
          aria-hidden="true"
          className="nf-tab-indicator pointer-events-none absolute inset-y-0 left-0"
          style={{
            width: `${100 / tabs.length}%`,
            transform: `translateX(${Math.max(activeIndex, 0) * 100}%)`,
            opacity: activeIndex < 0 ? 0 : 1,
          }}
        >
          <span className="nf-tab-bubble block h-full w-full rounded-full" />
        </span>
        <ul
          className="relative grid"
          style={{
            gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`,
          }}
        >
          {tabs.map(({ Icon, ...tab }) => (
            <li key={tab.href}>
              <Link
                href={tab.href}
                transitionTypes={["tab"]}
                aria-label={tab.ariaLabel}
                aria-current={tab.current ? "page" : undefined}
                onClick={(event) => {
                  // Tapping the tab you are on scrolls to the top, as on the
                  // contributor's bar. Deeper in it, the link itself pops
                  // back to the section.
                  if (
                    pathname !== tab.href ||
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                  ) {
                    return;
                  }
                  event.preventDefault();
                  window.scrollTo({
                    top: 0,
                    behavior: window.matchMedia?.(
                      "(prefers-reduced-motion: reduce)",
                    ).matches
                      ? "instant"
                      : "smooth",
                  });
                }}
                className={`press relative flex min-h-14 min-w-11 flex-col items-center justify-center gap-0.5 rounded-full px-1 text-xs font-bold focus-visible:outline-offset-[-3px] ${
                  tab.current ? "text-accent" : "text-muted-foreground"
                }`}
              >
                {tab.emoji ? (
                  <span
                    aria-hidden="true"
                    className="nf-tab-icon grid h-6 w-6 place-items-center text-[1.15rem] leading-none"
                  >
                    {tab.emoji}
                  </span>
                ) : (
                  <Icon aria-hidden="true" className="nf-tab-icon h-6 w-6" />
                )}
                <span className="max-w-full truncate">{tab.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

const PROFILE_HREF = "/account";
const PROFILE_PATHS = ["/account", "/settings", "/notifications", "/readiness"];

/**
 * A moderator's tab bar outside the staff screens (reading the site, their
 * You page). The moderation screens draw the same one themselves, through
 * StaffNav, so it never changes shape as they move between the two.
 */
export function ModeratorTabBar() {
  const pathname = usePathname();
  if (!showsTabBar(pathname)) return null;
  return (
    <>
      <ScrollToTopButton />
      {/* After the footer, where there is one; staff screens reserve this
          inside <main> instead (globals.css). */}
      <div
        aria-hidden="true"
        className="h-(--tab-bar-clearance) md:hidden print:hidden"
      />
      <StaffTabBar label="Moderation" links={MODERATION_LINKS} profileTab />
    </>
  );
}
