import "server-only";
import { createClient } from "@/lib/supabase/server";

export type DriveConnectionStatus = {
  connected: boolean;
  googleAccountEmail: string | null;
  connectedAt: string | null;
};

/**
 * The caller's own, non-secret Drive connection status, via the regular
 * RLS-respecting session client -- never the admin client, and never a
 * token column (the RPC's result shape simply has none). Safe to call
 * from Server Components directly; no import restriction applies to this
 * file, unlike lib/drive/token-store.ts.
 */
export async function getMyDriveConnectionStatus(): Promise<DriveConnectionStatus> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_drive_connection_status");

  if (error || !data || data.length === 0) {
    return { connected: false, googleAccountEmail: null, connectedAt: null };
  }

  const row = data[0];
  return {
    connected: row.connected,
    googleAccountEmail: row.google_account_email,
    connectedAt: row.connected_at,
  };
}
