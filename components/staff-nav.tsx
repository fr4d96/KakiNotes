import { ViewerIdentitySeed } from "@/lib/auth/viewer-identity";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { UserAvatarMenu } from "@/components/auth/user-avatar-menu";
import { NotificationBell } from "@/components/notifications/notification-bell";
import {
  StaffBackLink,
  StaffNavLinks,
  type StaffNavLink,
} from "@/components/staff-nav-links";
import { StaffTabBar } from "@/components/staff-tab-bar";
import type { AppRole } from "@/lib/auth/staff-guard";

/**
 * The shared header for every staff dashboard -- moderation, editorial,
 * admin, readiness -- in the same shape as the app's own header
 * (components/site-header.tsx): a sticky solid bar clear of the status bar.
 *
 * On a phone it reads like any pushed app screen: a back arrow one level up,
 * the dashboard's name and the bell on top, and its sections in a floating
 * tab bar at the bottom (staff-tab-bar.tsx), where the contributor's own tabs
 * are. From `md` it is one row: logo, name, sections, bell, avatar menu.
 *
 * Presentational only: each route group's own nav component still does its
 * own server-side role check and data fetching before rendering this. The
 * `role` passed through to UserAvatarMenu is likewise for drawing the menu,
 * never for authorizing anything -- see lib/auth/staff-menu.ts.
 */
export function StaffNav({
  label,
  links,
  avatarEmoji,
  role,
  name,
  profileTab = false,
}: {
  /** The dashboard's name, shown in the bar and as the nav's aria-label. */
  label: string;
  links: StaffNavLink[];
  avatarEmoji: string | null;
  role: AppRole | null;
  /** The viewer's username (else display name), for the Profile tab. */
  name?: string | null;
  /** End the phone tab bar with the viewer's own Profile tab. */
  profileTab?: boolean;
}) {
  return (
    <>
      <header
        data-staff-chrome=""
        className="journiq-header-solid sticky top-0 z-30 border-b border-border-subtle pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)] text-foreground shadow-sm"
      >
        <div className="mx-auto flex min-h-15 max-w-7xl items-center gap-2 px-3 md:min-h-[76px] md:gap-5 md:px-6">
          <StaffBackLink links={links} profileTab={profileTab} />
          {/* alt="" on the logo is deliberate: the wordmark is beside it. */}
          <Link
            href="/"
            className="flex min-h-11 shrink-0 items-center gap-2.5 text-xl font-black tracking-tight max-md:hidden"
          >
            <BrandLogo className="border border-border-subtle" />
            Kakinotes
          </Link>
          <span className="min-w-0 flex-1 truncate text-xl font-black tracking-tight md:flex-none md:text-base md:font-bold md:text-muted-foreground">
            {label}
          </span>
          <div className="ml-auto">
            <StaffNavLinks label={label} links={links} />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <NotificationBell />
            {/* Phones reach the menu's links from the You page instead, as
                everywhere else in the app. */}
            <div className="max-md:hidden">
              <UserAvatarMenu emoji={avatarEmoji} role={role} />
            </div>
            <ViewerIdentitySeed
              avatarEmoji={avatarEmoji}
              role={role}
              name={name ?? null}
            />
          </div>
        </div>
      </header>
      <StaffTabBar label={label} links={links} profileTab={profileTab} />
    </>
  );
}
