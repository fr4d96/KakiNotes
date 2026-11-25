import { StaffNav } from "@/components/staff-nav";
import type { StaffNavLink } from "@/components/staff-nav-links";
import {
  getCurrentUserAvatarEmoji,
  getCurrentUserTabName,
  getCurrentUserRole,
} from "@/lib/auth/roles";

const editorialNav: StaffNavLink[] = [
  { href: "/editorial", label: "Dashboard", icon: "editorial" },
  { href: "/editorial/new", label: "New Import", icon: "new" },
  { href: "/editorial/contributors", label: "Contributors", icon: "users" },
  { href: "/readiness", label: "Readiness", icon: "readiness" },
];

/**
 * Rendered only inside app/(editor)/editorial/layout.tsx, after the real
 * editor/admin role check passes -- same "own nav, no contradictions"
 * reasoning as components/contributor-nav.tsx. The header markup itself
 * (profile icon included) is components/staff-nav.tsx, shared with the
 * moderation, admin and readiness dashboards.
 */
export async function EditorialNav() {
  const [avatarEmoji, role, name] = await Promise.all([
    getCurrentUserAvatarEmoji(),
    getCurrentUserRole(),
    getCurrentUserTabName(),
  ]);

  return (
    <StaffNav
      label="Editorial"
      links={editorialNav}
      avatarEmoji={avatarEmoji}
      name={name}
      role={role}
    />
  );
}
