import { StaffNav } from "@/components/staff-nav";
import type { StaffNavLink } from "@/components/staff-nav-links";
import {
  getCurrentUserAvatarEmoji,
  getCurrentUserTabName,
  getCurrentUserRole,
} from "@/lib/auth/roles";

/**
 * Rendered only inside app/(admin)/admin/layout.tsx, after the real admin
 * role check passes -- same "own nav, no contradictions" reasoning as
 * ModerationNav/EditorialNav. "Overview" arrived with Phase 2: until the
 * dashboard existed, /admin was a stub Route Handler and linking to it
 * would have pointed at raw JSON. The header markup itself is
 * components/staff-nav.tsx, shared across the staff dashboards.
 */
const adminNav: StaffNavLink[] = [
  { href: "/admin", label: "Overview", icon: "overview" },
  { href: "/admin/users", label: "Users", icon: "users" },
  { href: "/moderation", label: "Moderation", icon: "stories" },
  { href: "/editorial", label: "Editorial", icon: "editorial" },
  { href: "/readiness", label: "Readiness", icon: "readiness" },
];

export async function AdminNav() {
  const [avatarEmoji, role, name] = await Promise.all([
    getCurrentUserAvatarEmoji(),
    getCurrentUserRole(),
    getCurrentUserTabName(),
  ]);

  return (
    <StaffNav
      label="Admin"
      links={adminNav}
      avatarEmoji={avatarEmoji}
      name={name}
      role={role}
    />
  );
}
