import { StaffNav } from "@/components/staff-nav";
import { MODERATION_LINKS } from "@/lib/navigation/moderation-links";
import {
  getCurrentUserAvatarEmoji,
  getCurrentUserTabName,
  getCurrentUserRole,
} from "@/lib/auth/roles";

/**
 * Rendered only inside app/(moderation)/moderation/layout.tsx, after the
 * real moderator/admin role check passes -- same "own nav, no
 * contradictions" reasoning as app/(editor)/editorial/editorial-nav.tsx.
 * The header markup itself (including the profile icon every signed-in
 * header renders, and the mobile row order) lives in components/staff-nav.tsx,
 * shared with the editorial, admin and readiness dashboards.
 */
export async function ModerationNav() {
  const [avatarEmoji, role, name] = await Promise.all([
    getCurrentUserAvatarEmoji(),
    getCurrentUserRole(),
    getCurrentUserTabName(),
  ]);

  return (
    <StaffNav
      label="Moderation"
      links={MODERATION_LINKS}
      profileTab
      avatarEmoji={avatarEmoji}
      name={name}
      role={role}
    />
  );
}
