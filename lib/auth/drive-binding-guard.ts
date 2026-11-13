import type { AppRole } from "@/lib/auth/staff-guard";

/** Where an ordinary contributor without a Drive connection is sent. */
export const CONNECT_DRIVE_PATH = "/connect-drive";

/**
 * Staff roles never have to connect Drive. Their photo work is editorial
 * imports, which always store in Supabase whatever Drive the editor has
 * (get_story_media_upload_mode() only ever answers google_drive for a
 * self_submitted story's own owner), so a Drive connection on a staff
 * account would move nothing.
 */
const DRIVE_EXEMPT_ROLES: readonly AppRole[] = ["editor", "moderator", "admin"];

/**
 * Does this signed-in caller have to connect Google Drive before using the
 * contributor area? Pure, so it can be unit-tested on plain input -- same
 * pattern as resolveContributorAccess / resolveStaffAccess.
 *
 * - Drive not configured on this deployment (no env vars, e.g. a preview
 *   build or CI): never required, since nobody could complete the step.
 * - Staff role: never required (see DRIVE_EXEMPT_ROLES).
 * - Everyone else ("user" role, or a missing role row, which fails closed
 *   to "ordinary contributor"): required until they have an active
 *   connection.
 *
 * This is the UX gate only. The storage rule itself is enforced in the
 * database (trigger story_media_require_drive_for_contributors), so a
 * contributor who skips this page still can't put a photo in Supabase.
 */
export function mustConnectDrive(input: {
  role: AppRole | null;
  driveConfigured: boolean;
  driveConnected: boolean;
}): boolean {
  if (!input.driveConfigured) return false;
  if (input.role && DRIVE_EXEMPT_ROLES.includes(input.role)) return false;
  return !input.driveConnected;
}
