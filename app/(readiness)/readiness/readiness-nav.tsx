import { StaffNav } from "@/components/staff-nav";
import { isReviewOnly } from "@/lib/auth/staff-menu";
import { MODERATION_LINKS } from "@/lib/navigation/moderation-links";
import type { StaffNavLink } from "@/components/staff-nav-links";
import {
  getCurrentUserAvatarEmoji,
  getCurrentUserTabName,
  getCurrentUserRole,
} from "@/lib/auth/roles";

const readinessNav: StaffNavLink[] = [
  { href: "/readiness", label: "Dashboard", icon: "readiness" },
  { href: "/editorial", label: "Editorial", icon: "editorial" },
  { href: "/moderation", label: "Moderation", icon: "stories" },
];

/**
 * Rendered only inside app/(readiness)/readiness/layout.tsx, after the real
 * editor/moderator/admin role check passes -- same "own nav, no
 * contradictions" reasoning as editorial-nav.tsx/moderation-nav.tsx. The
 * header markup itself (profile icon included) is
 * components/staff-nav.tsx, shared across the staff dashboards.
 *
 * Each role gets only links it can open: a moderator has their own
 * moderation sections (the same tab bar as everywhere else in their app), an
 * editor has no Moderation and an admin has both.
 */
export async function ReadinessNav() {
  const [avatarEmoji, role, name] = await Promise.all([
    getCurrentUserAvatarEmoji(),
    getCurrentUserRole(),
    getCurrentUserTabName(),
  ]);

  return (
    <StaffNav
      label="Readiness"
      links={
        isReviewOnly(role)
          ? MODERATION_LINKS
          : readinessNav.filter(
              (link) => role === "admin" || link.href !== "/moderation",
            )
      }
      profileTab={isReviewOnly(role)}
      avatarEmoji={avatarEmoji}
      name={name}
      role={role}
    />
  );
}
