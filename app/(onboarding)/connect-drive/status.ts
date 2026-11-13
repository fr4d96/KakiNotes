export type ConnectDriveStatus = "cancelled" | "failed" | null;

/**
 * Only the two outcomes the Drive callback ever sends to /connect-drive.
 * Anything else in ?drive= (including a hand-typed "connected") is ignored,
 * so the page can't be made to claim a connection that doesn't exist.
 */
export function parseConnectDriveStatus(
  value: string | string[] | undefined,
): ConnectDriveStatus {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "cancelled" || raw === "failed" ? raw : null;
}
