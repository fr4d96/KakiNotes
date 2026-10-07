import "server-only";
import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDriveEnv } from "@/lib/env.server";

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
 * reconnecting after a revoke) replaces the previous token rather than
 * creating a second row. `status` is reset to 'active' on every save.
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
}
