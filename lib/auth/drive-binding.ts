import "server-only";
import { getCurrentUserRole } from "@/lib/auth/roles";
import { isDriveConfigured } from "@/lib/env.server";
import { getMyDriveConnectionStatus } from "@/lib/drive/connection-status";
import { mustConnectDrive } from "@/lib/auth/drive-binding-guard";

/**
 * Server-side wrapper for mustConnectDrive(): supplies the caller's own role
 * (RLS-scoped, never a client claim) and their own Drive connection status.
 * Both reads are cache()d, so calling this from the (contributor) layout and
 * the /connect-drive page in one request costs one round trip each.
 *
 * Skips both reads entirely when Drive isn't configured on this deployment.
 */
export async function callerMustConnectDrive(): Promise<boolean> {
  const driveConfigured = isDriveConfigured();
  if (!driveConfigured) return false;

  const [role, status] = await Promise.all([
    getCurrentUserRole(),
    getMyDriveConnectionStatus(),
  ]);
  return mustConnectDrive({
    role,
    driveConfigured,
    driveConnected: status.connected,
  });
}
