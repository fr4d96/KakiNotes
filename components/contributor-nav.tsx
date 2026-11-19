import { ViewerIdentitySeed } from "@/lib/auth/viewer-identity";
import {
  getCurrentUserAvatarEmoji,
  getCurrentUserRole,
  getCurrentUserTabName,
} from "@/lib/auth/roles";

/**
 * Rendered only inside the (contributor) layout, after its guard has proven
 * a session. Draws nothing: it hands that session's avatar and role to the
 * browser's viewer store (lib/auth/viewer-identity.ts), so the app-wide
 * header and tab bar show the right avatar and staff links at once.
 *
 * This used to be the contributor routes' own header. Since 2026-11-18 one
 * header (SiteHeader) is drawn by app/layout.tsx for every route group, so
 * it stays on screen when a tap crosses from a public page to a contributor
 * page; only this server-side identity hand-off was left to do here.
 */
export async function ContributorIdentity() {
  const [avatarEmoji, role, name] = await Promise.all([
    getCurrentUserAvatarEmoji(),
    getCurrentUserRole(),
    getCurrentUserTabName(),
  ]);
  return (
    <ViewerIdentitySeed avatarEmoji={avatarEmoji} role={role} name={name} />
  );
}
