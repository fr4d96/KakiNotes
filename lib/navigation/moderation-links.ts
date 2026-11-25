import type { StaffNavLink } from "@/components/staff-nav-links";

/**
 * The moderation sections, shared by the moderation header and the tab bar a
 * moderator has across the whole app, so the two can't drift.
 */
export const MODERATION_LINKS: StaffNavLink[] = [
  { href: "/moderation", label: "Overview", icon: "overview" },
  { href: "/moderation/stories", label: "Stories", icon: "stories" },
  { href: "/moderation/reports", label: "Reports", icon: "reports" },
  { href: "/moderation/takedowns", label: "Takedowns", icon: "takedowns" },
  // Not a place to decide anything: on phones it is a row on the You page,
  // and its tab belongs to Profile.
  {
    href: "/readiness",
    label: "Readiness",
    icon: "readiness",
    headerOnly: true,
  },
];
