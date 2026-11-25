"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";
import { ArrowLeftIcon } from "@/components/icons";
import { isWithin } from "@/lib/navigation/app-chrome";

export type StaffNavLink = {
  href: string;
  label: string;
  /** Drawn in the phone tab bar (staff-tab-bar.tsx). */
  icon: StaffNavIcon;
  /** In the desktop header, but not a phone tab. */
  headerOnly?: boolean;
};

/** Names, not components: the link lists live in Server Components. */
export type StaffNavIcon =
  | "overview"
  | "stories"
  | "reports"
  | "takedowns"
  | "readiness"
  | "users"
  | "editorial"
  | "new";

/**
 * The link for the screen being looked at: the deepest one that contains
 * it, so /moderation/stories lights "Stories" and not also "Overview".
 */
export function activeStaffHref(
  links: StaffNavLink[],
  pathname: string | null,
): string | null {
  const matches = links.filter((link) => isWithin(pathname, link.href));
  matches.sort((a, b) => b.href.length - a.href.length);
  return matches[0]?.href ?? null;
}

/**
 * A staff dashboard's sections from `md` up, as pills in the header with the
 * current one filled. Phones have the tab bar instead (staff-tab-bar.tsx).
 */
export function StaffNavLinks({
  label,
  links,
}: {
  label: string;
  links: StaffNavLink[];
}) {
  const active = activeStaffHref(links, usePathname());

  return (
    <nav aria-label={label} className="flex items-center gap-1 max-md:hidden">
      {links.map((link) => {
        const current = link.href === active;
        return (
          <Link
            key={link.href}
            href={link.href}
            transitionTypes={["tab"]}
            aria-current={current ? "page" : undefined}
            className={`press inline-flex min-h-11 shrink-0 items-center rounded-full px-4 text-sm font-bold whitespace-nowrap ${
              current
                ? "bg-tag-background text-tag-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * The left of the phone's top bar. Inside a section (a story, a report) it
 * is a back arrow to that section's list. At a section's root it depends on
 * the way out: with a Profile tab below it is the app's own logo, as on the
 * contributor's root screens; without one, an arrow back to the You page,
 * where the staff links live.
 */
export function StaffBackLink({
  links,
  profileTab = false,
}: {
  links: StaffNavLink[];
  profileTab?: boolean;
}) {
  const pathname = usePathname();
  const active = activeStaffHref(links, pathname);
  const parent = links.find(
    (link) => link.href === active && link.href !== pathname,
  );
  if (!parent && profileTab) {
    return (
      <Link
        href="/"
        aria-label="Kakinotes home"
        className="press grid h-11 w-11 shrink-0 place-items-center rounded-full md:hidden"
      >
        <BrandLogo className="border border-border-subtle" />
      </Link>
    );
  }
  return (
    <Link
      href={parent?.href ?? "/account"}
      transitionTypes={["nav-back"]}
      aria-label={parent ? `Back to ${parent.label}` : "Back to your profile"}
      className="press grid h-11 w-11 shrink-0 place-items-center rounded-full md:hidden"
    >
      <ArrowLeftIcon aria-hidden="true" className="h-6 w-6" />
    </Link>
  );
}
