import "server-only";

/**
 * The two in-memory, per-process caches lib/drive/drive-client.ts keeps
 * (access tokens, resolved Kakinotes/.staging folder ids), split into their
 * own module so lib/drive/token-store.ts can invalidate them on
 * disconnect/reconnect/refresh-failed WITHOUT creating an import cycle:
 * drive-client.ts already imports token-store.ts (for the encrypted
 * connection row), so token-store.ts importing drive-client.ts back would
 * be circular. Both modules import this one instead; neither imports the
 * other for caching purposes.
 *
 * KEYING: both caches are keyed by connection IDENTITY
 * (`${userId}:${connectionId}:${tokenAuthTag}`, built in drive-client.ts),
 * not by userId alone. token_auth_tag is GCM's own per-encryption tag --
 * it changes every time saveDriveConnection() runs (a fresh random IV/tag
 * is drawn on every encryption, even reconnecting with the exact same
 * Google account), and never changes for any other write (folder-id saves,
 * a status flip). That makes it the right value to detect "this is a
 * DIFFERENT connection than whatever got cached before", which userId
 * alone cannot: disconnect-then-reconnect-with-a-different-account inside
 * the token's ~1h lifetime must never keep serving the OLD account's
 * cached token or folder ids. Keying by identity makes a stale cache entry
 * simply unreachable (the next read computes a different key) rather than
 * relying on remembering to invalidate it everywhere -- invalidateDrive
 * CachesForUser below is belt-and-braces on top of that, for same-instance
 * cleanup on disconnect, not the primary safety mechanism.
 *
 * Still process-local: a production deployment with several serverless
 * instances has one of each cache PER instance. That's fine for the
 * performance goal (each instance independently avoids repeating the
 * Google token exchange / Drive folder search within its own lifetime);
 * it's the identity-based key, not any cross-instance invalidation, that
 * makes it safe for correctness.
 */

export type CachedAccessToken = { accessToken: string; expiresAt: number };
export type CachedFolderIds = { appFolderId: string; stagingFolderId: string };

const accessTokenCache = new Map<string, CachedAccessToken>();
const folderIdsCache = new Map<string, CachedFolderIds>();

export function getCachedAccessToken(
  key: string,
): CachedAccessToken | undefined {
  return accessTokenCache.get(key);
}

export function setCachedAccessToken(
  key: string,
  value: CachedAccessToken,
): void {
  accessTokenCache.set(key, value);
}

export function getCachedFolderIds(key: string): CachedFolderIds | undefined {
  return folderIdsCache.get(key);
}

export function setCachedFolderIds(key: string, value: CachedFolderIds): void {
  folderIdsCache.set(key, value);
}

export function deleteCachedFolderIds(key: string): void {
  folderIdsCache.delete(key);
}

/**
 * Drops EVERY cached entry (both caches, any identity) for this user on
 * THIS instance — called from token-store.ts at the end of
 * deleteDriveConnection, saveDriveConnection and
 * markDriveConnectionRefreshFailed. Belt-and-braces on top of the
 * identity-based key itself: even if a key were somehow computed from
 * stale state, this clears it outright. Does not reach other serverless
 * instances' memory — see this file's header for why the identity key,
 * not this function, is what makes the fix correct across instances.
 */
export function invalidateDriveCachesForUser(userId: string): void {
  const prefix = `${userId}:`;
  for (const key of accessTokenCache.keys()) {
    if (key.startsWith(prefix)) accessTokenCache.delete(key);
  }
  for (const key of folderIdsCache.keys()) {
    if (key.startsWith(prefix)) folderIdsCache.delete(key);
  }
}

/** Test-only: identical to invalidateDriveCachesForUser, named for clarity at call sites in tests. Never used from application code. */
export function __resetDriveCachesForTests(userId: string): void {
  invalidateDriveCachesForUser(userId);
}
