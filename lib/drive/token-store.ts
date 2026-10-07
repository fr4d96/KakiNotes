import "server-only";
import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDriveEnv } from "@/lib/env.server";
import { invalidateDriveCachesForUser } from "@/lib/drive/drive-cache";

/**
 * The ONE module allowed to read/write `contributor_drive_connections`
 * (enforced by the `no-restricted-imports` ESLint rule in
 * eslint.config.mjs, plus `server-only`'s build-time guarantee) and the
 * ONE module allowed to import lib/supabase/admin.ts for this table — see
 * that migration's header for why a normal RLS policy can't safely expose
 * any row of this table to its own owner (it holds a secret, and a policy
 * only scopes rows, not columns).
 *
 * Every exported function here takes a server-derived `userId` that the
 * caller already resolved from the session (never trusts one passed from
 * the client — Engineering Rule 2). Never logs a plaintext or encrypted
 * token value, an IV, or an auth tag.
 *
 * Encryption: AES-256-GCM, a fresh random 12-byte IV per encryption (GCM's
 * standard nonce size — reusing an IV under the same key is what breaks
 * GCM's security guarantee, so a new one is drawn every call, never
 * derived from anything predictable). The auth tag is stored in its own
 * column, not appended to the ciphertext, so a flipped bit in either one
 * fails authentication on decrypt rather than silently producing garbage
 * plaintext. `encryption_key_version` is carried on every row so a future
 * key rotation has something to key off — today there is exactly one
 * version (1), tied to `GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY`.
 */

const CURRENT_KEY_VERSION = 1;
const IV_LENGTH_BYTES = 12;
const ALGORITHM = "aes-256-gcm";

function getEncryptionKey(): Buffer {
  return Buffer.from(getDriveEnv().GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY, "base64");
}

export type EncryptedToken = {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
  keyVersion: number;
};

/** Encrypts a plaintext refresh token. Never logs the input or output. */
export function encryptRefreshToken(plaintext: string): EncryptedToken {
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return { ciphertext, iv, authTag, keyVersion: CURRENT_KEY_VERSION };
}

/**
 * Decrypts a stored token. Throws if the key version isn't the one this
 * module currently supports, or if GCM's own tamper check fails (wrong
 * key, or either the ciphertext or the auth tag was modified) — callers
 * must not swallow that into "not connected"; it means the row is
 * corrupt or the key has changed, which is a `refresh_failed`-worthy
 * condition, not a silent miss.
 */
export function decryptRefreshToken(encrypted: EncryptedToken): string {
  if (encrypted.keyVersion !== CURRENT_KEY_VERSION) {
    throw new Error(
      `Unsupported encryption_key_version ${encrypted.keyVersion} — no key configured for it.`,
    );
  }
  const decipher = createDecipheriv(
    ALGORITHM,
    getEncryptionKey(),
    encrypted.iv,
  );
  decipher.setAuthTag(encrypted.authTag);
  const plaintext = Buffer.concat([
    decipher.update(encrypted.ciphertext),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

export type DriveConnectionStatus = "active" | "revoked" | "refresh_failed";

export type SaveDriveConnectionInput = {
  userId: string;
  refreshToken: string;
  googleAccountEmail: string | null;
  googleAccountSub: string | null;
};

/**
 * Encrypts and upserts the caller's connection row, keyed on the unique
 * `user_id` column — one row per contributor, so connecting again (e.g.
 * reconnecting after a revoke, or with a DIFFERENT Google account) replaces
 * the previous token rather than creating a second row. `status` is reset
 * to 'active' on every save.
 *
 * Invalidates this user's in-memory caches (lib/drive/drive-cache.ts) on
 * THIS instance before returning — belt-and-braces: the fresh
 * `token_auth_tag` this write produces already makes any OLD cache entry
 * unreachable by key (drive-client.ts's cache key includes it), but this
 * clears it outright rather than leaving it to simply age out unused.
 */
export async function saveDriveConnection(
  input: SaveDriveConnectionInput,
): Promise<void> {
  const { ciphertext, iv, authTag, keyVersion } = encryptRefreshToken(
    input.refreshToken,
  );

  const admin = createAdminClient();
  const { error } = await admin.from("contributor_drive_connections").upsert(
    {
      user_id: input.userId,
      encrypted_refresh_token: ciphertext.toString("base64"),
      token_iv: iv.toString("base64"),
      token_auth_tag: authTag.toString("base64"),
      encryption_key_version: keyVersion,
      google_account_email: input.googleAccountEmail,
      google_account_sub: input.googleAccountSub,
      status: "active",
    },
    { onConflict: "user_id" },
  );

  if (error) {
    throw new Error(`Failed to save Drive connection: ${error.message}`);
  }
  invalidateDriveCachesForUser(input.userId);
}

export type DriveConnectionRow = {
  refreshToken: string;
  googleAccountEmail: string | null;
  status: DriveConnectionStatus;
};

/**
 * Reads and decrypts the caller's own connection row. Returns null when no
 * row exists — never throws for "not connected". Reserved for a later
 * slice's token-refresh path (section 2 of the design doc); slice 1 has no
 * caller for this yet besides the disconnect flow checking existence.
 */
export async function readDriveConnection(
  userId: string,
): Promise<DriveConnectionRow | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("contributor_drive_connections")
    .select(
      "encrypted_refresh_token, token_iv, token_auth_tag, encryption_key_version, google_account_email, status",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to read Drive connection: ${error.message}`);
  }
  if (!data) {
    return null;
  }

  const refreshToken = decryptRefreshToken({
    ciphertext: Buffer.from(data.encrypted_refresh_token, "base64"),
    iv: Buffer.from(data.token_iv, "base64"),
    authTag: Buffer.from(data.token_auth_tag, "base64"),
    keyVersion: data.encryption_key_version,
  });

  return {
    refreshToken,
    googleAccountEmail: data.google_account_email,
    status: data.status as DriveConnectionStatus,
  };
}

/**
 * Deletes the caller's connection row outright (not a soft-delete/status
 * flip) — this is the disconnect flow's local half, called after the
 * best-effort revoke call to Google's own revoke endpoint. Returns
 * normally whether or not a row existed.
 *
 * Invalidates this user's in-memory caches on THIS instance before
 * returning, so this instance can never keep serving a cached access
 * token or folder id for a connection that no longer exists in the
 * database (docs/google-drive-integration.md section 8: disconnecting
 * must stop Drive photos from showing). The row being gone already makes
 * the NEXT getAccessToken()/ensureAppFolders() call throw
 * DriveConnectionError on its own (no row found); this just means an
 * in-flight-cached entry doesn't linger for up to its own ~1h expiry on
 * this instance in the meantime.
 */
export async function deleteDriveConnection(userId: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("contributor_drive_connections")
    .delete()
    .eq("user_id", userId);

  if (error) {
    throw new Error(`Failed to delete Drive connection: ${error.message}`);
  }
  invalidateDriveCachesForUser(userId);
}

/**
 * Flips a connection's status to 'refresh_failed' — called by
 * lib/drive/drive-client.ts when Google's token endpoint reports
 * `invalid_grant` while refreshing an access token (the refresh token was
 * revoked or expired). Does not delete the row: the encrypted (now
 * useless) refresh token stays, matching the failure-mode table in
 * docs/google-drive-integration.md section 6, which treats this identically
 * to a contributor-initiated revoke until they reconnect.
 */
export async function markDriveConnectionRefreshFailed(
  userId: string,
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("contributor_drive_connections")
    .update({ status: "refresh_failed" })
    .eq("user_id", userId);

  if (error) {
    throw new Error(
      `Failed to mark Drive connection refresh_failed: ${error.message}`,
    );
  }
  invalidateDriveCachesForUser(userId);
}

export type DriveConnectionState = {
  /** null only when there is no connection row at all for this user. */
  connectionId: string | null;
  /**
   * token_auth_tag, base64 — NOT decrypted, not usable as a credential on
   * its own (GCM's auth tag authenticates the ciphertext, it isn't a key).
   * Exposed here purely as an IDENTITY marker: it changes on every
   * saveDriveConnection() call (a fresh one is drawn per encryption, even
   * reconnecting with the same Google account) and on no other write, so
   * lib/drive/drive-client.ts uses `${userId}:${connectionId}:${identityToken}`
   * as its cache key — a disconnect+reconnect (same or different account)
   * always produces a new key, so a stale cached token/folder-id can never
   * be served under the new connection.
   */
  identityToken: string | null;
  status: DriveConnectionStatus | null;
  appFolderId: string | null;
  stagingFolderId: string | null;
};

/**
 * THE one cheap, indexed DB read lib/drive/drive-client.ts's getAccessToken
 * and ensureAppFolders each start with, every single call (warm or cold) —
 * confirms an ACTIVE connection row exists and returns its identity
 * (connectionId/identityToken, for the cache key) together with the
 * folder ids, all in one query. This is the read that must never be
 * skipped in favor of trusting an in-memory cache blindly: the cache is
 * only ever consulted AFTER this confirms which connection (if any) is
 * currently active. A null/inactive result means "no cached value may be
 * used, full stop" — the caller throws DriveConnectionError before
 * touching either cache.
 */
export async function getDriveConnectionState(
  userId: string,
): Promise<DriveConnectionState> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("contributor_drive_connections")
    .select("id, token_auth_tag, status, drive_folder_id, staging_folder_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to read Drive connection state: ${error.message}`);
  }
  return {
    connectionId: data?.id ?? null,
    identityToken: data?.token_auth_tag ?? null,
    status: (data?.status as DriveConnectionStatus | undefined) ?? null,
    appFolderId: data?.drive_folder_id ?? null,
    stagingFolderId: data?.staging_folder_id ?? null,
  };
}

/**
 * Persists the caller's app-folder id once lib/drive/drive-client.ts has
 * found-or-created it. Safe to call repeatedly with the same value (a
 * plain overwrite, not an append) — find-or-create is itself idempotent on
 * the Drive side.
 */
export async function setDriveFolderId(
  userId: string,
  driveFolderId: string,
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("contributor_drive_connections")
    .update({ drive_folder_id: driveFolderId })
    .eq("user_id", userId);

  if (error) {
    throw new Error(`Failed to save Drive folder id: ${error.message}`);
  }
}

/**
 * Persists the caller's resolved STAGING folder id
 * (supabase/migrations/20261007194535_drive_staging_folder_and_sync_gate_
 * fix.sql's new nullable column). Once this is set, ensureAppFolders()
 * trusts it directly (no Drive search call) and skips the one-time legacy
 * "Kakinotes staging" cleanup for good — a set value IS the "already
 * cleaned up" record, not a separate flag.
 */
export async function setStagingFolderId(
  userId: string,
  stagingFolderId: string,
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("contributor_drive_connections")
    .update({ staging_folder_id: stagingFolderId })
    .eq("user_id", userId);

  if (error) {
    throw new Error(`Failed to save Drive staging folder id: ${error.message}`);
  }
}
