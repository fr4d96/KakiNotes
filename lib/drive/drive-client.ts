import "server-only";
import {
  readDriveConnection,
  markDriveConnectionRefreshFailed,
  getDriveConnectionState,
  setDriveFolderId,
  setStagingFolderId,
} from "@/lib/drive/token-store";
import { getDriveEnv } from "@/lib/env.server";
import {
  getCachedAccessToken,
  setCachedAccessToken,
  getCachedFolderIds,
  setCachedFolderIds,
  deleteCachedFolderIds,
  invalidateDriveCachesForUser,
  __resetDriveCachesForTests,
} from "@/lib/drive/drive-cache";

/**
 * Plain-`fetch` calls to Google's OAuth/Drive v3 REST endpoints — no new
 * dependency (the task for this slice explicitly asks for "plain fetch, no
 * new dependencies"; docs/google-drive-integration.md section 13 expects a
 * client library for a LATER slice, not this one). The only module besides
 * lib/drive/token-store.ts itself allowed to import token-store.ts directly
 * (eslint.config.mjs already allows anything under lib/drive/**).
 *
 * Every exported function here takes a server-derived `userId` the caller
 * already resolved from the session — never a client-supplied id
 * (Engineering Rule 2). Never logs an access or refresh token.
 *
 * PERFORMANCE (owner-reported real timings: beginDriveMediaUploadAction
 * 4.3s, finalizeDriveMediaUploadAction 16.9s for a 59 KB JPEG — target
 * <1.5s / <4s, and must not grow with story size). Two in-memory,
 * per-process caches (lib/drive/drive-cache.ts) are the main fix, both
 * keyed by CONNECTION IDENTITY (`${userId}:${connectionId}:${identityToken}`,
 * never userId alone — see connectionCacheKey and getAccessToken's own
 * comment for why):
 *   - the access-token cache: getAccessToken() used to do a DB read +
 *     decrypt + a real Google token-exchange HTTP round trip on EVERY
 *     call, and finalize called it 2-3 times across drive-sync.ts/
 *     drive-folders.ts. Now cached until ~60s before Google's own
 *     expires_in.
 *   - the folder-ids cache: ensureAppFolders() used to do a Drive
 *     files.list SEARCH call for "Kakinotes" and ".staging" on every begin
 *     AND finalize, even once both ids were already known. Now trusts a
 *     stored/cached id outright and only falls back to find-or-create when
 *     an id is missing, or a downstream Drive call on it comes back
 *     404/trashed (see ensureAppFolders's own comment).
 * Neither cache is ever logged or persisted beyond this process's memory.
 */

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const DRIVE_FILES_ENDPOINT = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_ENDPOINT =
  "https://www.googleapis.com/upload/drive/v3/files";

const APP_FOLDER_NAME = "Kakinotes";
// Nested inside the app folder, not a top-level sibling -- a contributor's
// Drive should only ever show the one "Kakinotes" folder. Renamed from the
// original "Kakinotes staging" to ".staging" (leading dot keeps it sorted
// away from the story folders it sits alongside once this slice gives every
// story its own named subfolder). See ensureAppFolders()'s legacy-cleanup
// comment for contributors whose staging folder predates this nesting.
const STAGING_FOLDER_NAME = ".staging";
const LEGACY_TOP_LEVEL_STAGING_FOLDER_NAME = "Kakinotes staging";

export class DriveConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DriveConnectionError";
  }
}

export class DriveApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "DriveApiError";
  }
}

/**
 * The browser's own origin, for the `Origin` header the resumable-session
 * start MUST send (docs/google-drive-integration.md section 4(a)'s spike
 * result: the browser's PUT is blocked without it). Deliberately derived
 * from configuration, the same value GOOGLE_DRIVE_OAUTH_REDIRECT_URI's
 * origin already is — NEVER from the incoming request's own Origin/Host
 * header, which is attacker-controlled input.
 */
function configuredOrigin(): string {
  return new URL(getDriveEnv().GOOGLE_DRIVE_OAUTH_REDIRECT_URI).origin;
}

// ---------------------------------------------------------------------------
// In-memory access-token cache — keyed by CONNECTION IDENTITY, not userId
// ---------------------------------------------------------------------------
//
// BUG FIXED HERE: keying by userId alone meant a disconnect followed by a
// reconnect (same OR a different Google account) within the token's ~1h
// lifetime kept serving the OLD account's cached access token/folder ids on
// any server instance that happened to have it cached — uploads could land
// in the wrong person's Drive, and the /media proxy could keep serving a
// disconnected contributor's photos. Both caches are now keyed by
// `${userId}:${connectionId}:${identityToken}` (connectionCacheKey below),
// built from a FRESH read every single call (getDriveConnectionState,
// token-store.ts) — never trusted from a prior call. identityToken is
// token_auth_tag: it changes on every saveDriveConnection(), and on nothing
// else, so a stale key simply becomes unreachable the moment the
// connection changes; see lib/drive/drive-cache.ts's header for the full
// reasoning, including why this is the PRIMARY safety mechanism and
// invalidateDriveCachesForUser (called from token-store.ts on disconnect/
// reconnect/refresh-failed) is only belt-and-braces on top of it.
//
// Never logged, never persisted (lost on process restart, which is fine:
// the next call just refreshes once). Module-level Maps are process-local
// by design; on a multi-instance deployment each instance keeps its own
// cache, which only means at most one refresh per instance instead of one
// per request — still the entire win this fix is after.

const TOKEN_EXPIRY_SAFETY_MARGIN_MS = 60_000;

/** `${userId}:${connectionId}:${identityToken}` — see the block comment above. */
function connectionCacheKey(
  userId: string,
  connectionId: string,
  identityToken: string,
): string {
  return `${userId}:${connectionId}:${identityToken}`;
}

/**
 * Drops EVERY cached entry for this user (both caches, any identity) on
 * this instance — called after a 401 from Drive (the cached token was
 * rejected despite our own expiry bookkeeping saying it should still be
 * valid) so the next call re-derives the current identity and re-refreshes,
 * rather than retrying the same bad token forever.
 */
export function invalidateAccessToken(userId: string): void {
  invalidateDriveCachesForUser(userId);
}

/**
 * Test-only: re-exported so tests can reset both in-memory caches for a
 * user between otherwise-independent test cases in the same file. Both
 * caches are module-level singletons that otherwise persist for this
 * process's lifetime (by design — that's the whole performance fix). Never
 * called from application code.
 */
export const __resetDriveClientCachesForTests = __resetDriveCachesForTests;

async function refreshAccessToken(
  userId: string,
  cacheKey: string,
): Promise<string> {
  const connection = await readDriveConnection(userId);
  if (!connection || connection.status !== "active") {
    throw new DriveConnectionError(
      `No active Google Drive connection for user ${userId}`,
    );
  }

  const driveEnv = getDriveEnv();
  let response: Response;
  try {
    response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: connection.refreshToken,
        client_id: driveEnv.GOOGLE_DRIVE_OAUTH_CLIENT_ID,
        client_secret: driveEnv.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET,
        grant_type: "refresh_token",
      }),
    });
  } catch (err) {
    throw new DriveApiError(
      `Drive token refresh request failed: ${err instanceof Error ? err.message : "unknown error"}`,
    );
  }

  if (!response.ok) {
    let errorCode: string | undefined;
    try {
      const body = (await response.json()) as { error?: string };
      errorCode = body.error;
    } catch {
      // Non-JSON error body — fall through with errorCode undefined.
    }
    if (errorCode === "invalid_grant") {
      await markDriveConnectionRefreshFailed(userId);
      throw new DriveConnectionError(
        `Drive refresh token for user ${userId} is invalid or revoked`,
      );
    }
    throw new DriveApiError(
      `Drive token refresh failed (${response.status})`,
      response.status,
    );
  }

  const json = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!json.access_token) {
    throw new DriveApiError("Drive token refresh returned no access_token");
  }

  // Google's expires_in is in whole seconds, typically 3600. Cache until
  // 60s before that, falling back to a conservative 5-minute cache if
  // Google ever omits expires_in (never observed, but never trust it
  // blindly either).
  const expiresInMs = (json.expires_in ?? 300) * 1000;
  setCachedAccessToken(cacheKey, {
    accessToken: json.access_token,
    expiresAt:
      Date.now() + Math.max(expiresInMs - TOKEN_EXPIRY_SAFETY_MARGIN_MS, 0),
  });

  return json.access_token;
}

/**
 * Returns a still-valid cached access token for this user, refreshing (a
 * second DB read + decrypt + a real Google token-exchange call) only on a
 * cache miss or expiry.
 *
 * ALWAYS starts with ONE cheap, indexed DB read (getDriveConnectionState)
 * that confirms an ACTIVE connection row exists and returns its identity —
 * this is the read the cache is keyed from, and it is never skipped, even
 * on what would otherwise be a cache hit: a cached value is only ever
 * consulted using THIS call's freshly-read identity, never a remembered
 * one. No row, or a non-active status, throws DriveConnectionError before
 * either cache is touched at all — no stale cached token can ever be
 * returned for a disconnected or inactive connection.
 *
 * On `invalid_grant` specifically, marks the connection `refresh_failed`
 * before throwing, per docs/google-drive-integration.md section 2/6.
 */
export async function getAccessToken(userId: string): Promise<string> {
  const state = await getDriveConnectionState(userId);
  if (
    !state.connectionId ||
    !state.identityToken ||
    state.status !== "active"
  ) {
    throw new DriveConnectionError(
      `No active Google Drive connection for user ${userId}`,
    );
  }
  const cacheKey = connectionCacheKey(
    userId,
    state.connectionId,
    state.identityToken,
  );

  const cached = getCachedAccessToken(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.accessToken;
  }
  return refreshAccessToken(userId, cacheKey);
}

// ---------------------------------------------------------------------------
// Shared request helper: retry once on 401 by dropping the cached token
// ---------------------------------------------------------------------------

/**
 * Every exported Drive-call function below accepts an optional trailing
 * `userId`. When given, a 401 response triggers exactly one retry: drop the
 * cached token (it's stale/revoked despite our own expiry bookkeeping),
 * refresh once via getAccessToken(), and reissue the SAME request with the
 * fresh token. Without a `userId` (a few internal/legacy call sites, and
 * any test that doesn't care about retry), a 401 surfaces as a normal
 * DriveApiError instead — no silent behavior change for those callers.
 */
async function driveFetch(
  url: string,
  init: RequestInit,
  accessToken: string,
  userId?: string,
): Promise<Response> {
  const withAuth = (token: string): RequestInit => ({
    ...init,
    headers: {
      ...(init.headers as Record<string, string> | undefined),
      Authorization: `Bearer ${token}`,
    },
  });

  let response = await fetch(url, withAuth(accessToken));
  if (response.status === 401 && userId) {
    invalidateAccessToken(userId);
    const freshToken = await getAccessToken(userId);
    response = await fetch(url, withAuth(freshToken));
  }
  return response;
}

type DriveFileListResponse = {
  files?: { id: string; name: string; parents?: string[] }[];
};

export async function findFolder(
  accessToken: string,
  name: string,
  parentId: string | null,
  userId?: string,
): Promise<string | null> {
  const parentClause = parentId
    ? `and '${parentId}' in parents`
    : "and 'root' in parents";
  const q = `mimeType = 'application/vnd.google-apps.folder' and name = '${name}' and trashed = false ${parentClause}`;
  const url = `${DRIVE_FILES_ENDPOINT}?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive`;
  const response = await driveFetch(url, {}, accessToken, userId);
  if (!response.ok) {
    throw new DriveApiError(
      `Drive folder lookup failed (${response.status})`,
      response.status,
    );
  }
  const json = (await response.json()) as DriveFileListResponse;
  return json.files?.[0]?.id ?? null;
}

export async function createFolder(
  accessToken: string,
  name: string,
  parentId: string | null,
  userId?: string,
): Promise<string> {
  const response = await driveFetch(
    `${DRIVE_FILES_ENDPOINT}?fields=id`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        mimeType: "application/vnd.google-apps.folder",
        parents: parentId ? [parentId] : undefined,
      }),
    },
    accessToken,
    userId,
  );
  if (!response.ok) {
    throw new DriveApiError(
      `Drive folder creation failed (${response.status})`,
      response.status,
    );
  }
  const json = (await response.json()) as { id: string };
  return json.id;
}

async function findOrCreateFolder(
  accessToken: string,
  name: string,
  parentId: string | null,
  userId?: string,
): Promise<string> {
  const existing = await findFolder(accessToken, name, parentId, userId);
  if (existing) return existing;
  return createFolder(accessToken, name, parentId, userId);
}

export type AppFolders = { appFolderId: string; stagingFolderId: string };

/**
 * True only when a folder has no children (files or subfolders) that
 * aren't already trashed — used before permanently deleting a legacy
 * staging folder below, so an old folder that still holds an abandoned raw
 * upload is left alone rather than silently destroyed.
 */
async function isFolderEmpty(
  accessToken: string,
  folderId: string,
  userId?: string,
): Promise<boolean> {
  const q = `'${folderId}' in parents and trashed = false`;
  const url = `${DRIVE_FILES_ENDPOINT}?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1&spaces=drive`;
  const response = await driveFetch(url, {}, accessToken, userId);
  if (!response.ok) {
    throw new DriveApiError(
      `Drive folder-contents check failed (${response.status})`,
      response.status,
    );
  }
  const json = (await response.json()) as DriveFileListResponse;
  return (json.files?.length ?? 0) === 0;
}

/**
 * Best-effort: finds the LEGACY "Kakinotes staging" folder, wherever it is
 * — a CHILD of the app folder (where slice 3 actually created it; the
 * review that found the leftover folder confirmed it was never top-level)
 * AND, belt and braces, directly under 'root' too, in case an even older
 * build put it there. If found and empty, permanently deletes it; if not
 * empty (an abandoned raw upload), leaves it alone. Any failure here is
 * logged and swallowed — this must never fail an upload.
 */
async function cleanUpLegacyStagingFolder(
  accessToken: string,
  appFolderId: string,
  newStagingFolderId: string,
  userId: string,
): Promise<void> {
  try {
    const candidates = await Promise.all([
      findFolder(
        accessToken,
        LEGACY_TOP_LEVEL_STAGING_FOLDER_NAME,
        appFolderId,
        userId,
      ),
      findFolder(
        accessToken,
        LEGACY_TOP_LEVEL_STAGING_FOLDER_NAME,
        null,
        userId,
      ),
    ]);
    for (const legacyId of new Set(
      candidates.filter((id): id is string => !!id),
    )) {
      if (legacyId === newStagingFolderId) continue;
      if (await isFolderEmpty(accessToken, legacyId, userId)) {
        await deleteFilePermanently(accessToken, legacyId, userId);
      }
    }
  } catch (err) {
    console.error("Legacy staging folder cleanup failed", {
      userId,
      error: err instanceof Error ? err.message : err,
    });
  }
}

/**
 * Finds (or, on a contributor's first Drive upload, creates) the
 * contributor's "Kakinotes" app folder and its ".staging" subfolder.
 *
 * ALWAYS starts with the SAME ONE cheap, indexed DB read getAccessToken()
 * makes (getDriveConnectionState) — confirms an ACTIVE connection and
 * derives the connection-identity cache key fresh, every call. No row, or
 * a non-active status, throws DriveConnectionError before either cache is
 * touched — see getAccessToken's own comment for why this (not a userId-
 * only cache) is what makes a disconnect/reconnect safe.
 *
 * FAST PATH (the common case once a connection has used Drive before):
 * both ids already stored (contributor_drive_connections.drive_folder_id/
 * staging_folder_id) or already cached under this exact identity key —
 * returns with ZERO Drive API calls beyond the one DB read above. This is
 * what removed the files.list SEARCH call this function used to make on
 * every single begin AND finalize.
 *
 * SLOW PATH (first-ever Drive use, or recovering from a stale id): resolves
 * whichever id is missing via find-or-create, and — ONLY when
 * stagingFolderId was not yet stored at all (never on a normal cached hit)
 * — also runs the one-time legacy-staging-folder cleanup
 * (cleanUpLegacyStagingFolder above) before recording the new nested
 * ".staging" id. Once staging_folder_id is set, it is trusted from then on
 * and this cleanup never runs again for this connection.
 *
 * RECOVERY: pass `forceResolve: true` after catching a 404/trashed error
 * from a Drive call that used a previously-trusted id — this clears the
 * in-memory cache entry for this identity and re-resolves from scratch
 * (but does NOT re-run the legacy cleanup if staging_folder_id was already
 * set; that one-time job is considered done regardless of a later,
 * unrelated 404).
 */
export async function ensureAppFolders(
  userId: string,
  accessToken: string,
  options?: { forceResolve?: boolean },
): Promise<AppFolders> {
  const state = await getDriveConnectionState(userId);
  if (
    !state.connectionId ||
    !state.identityToken ||
    state.status !== "active"
  ) {
    throw new DriveConnectionError(
      `No active Google Drive connection for user ${userId}`,
    );
  }
  const cacheKey = connectionCacheKey(
    userId,
    state.connectionId,
    state.identityToken,
  );

  if (!options?.forceResolve) {
    const cached = getCachedFolderIds(cacheKey);
    if (cached) return cached;
  } else {
    deleteCachedFolderIds(cacheKey);
  }

  let appFolderId = options?.forceResolve ? null : state.appFolderId;
  let stagingFolderId = options?.forceResolve ? null : state.stagingFolderId;
  const stagingWasUnset = !state.stagingFolderId;

  if (appFolderId && stagingFolderId) {
    const resolved = { appFolderId, stagingFolderId };
    setCachedFolderIds(cacheKey, resolved);
    return resolved;
  }

  if (!appFolderId) {
    appFolderId = await findOrCreateFolder(
      accessToken,
      APP_FOLDER_NAME,
      null,
      userId,
    );
    await setDriveFolderId(userId, appFolderId);
  }

  if (!stagingFolderId) {
    stagingFolderId = await findOrCreateFolder(
      accessToken,
      STAGING_FOLDER_NAME,
      appFolderId,
      userId,
    );
    // Run the one-time legacy cleanup ONLY when staging_folder_id had never
    // been recorded before this call — never on a plain forceResolve retry
    // of an already-resolved connection.
    if (stagingWasUnset) {
      await cleanUpLegacyStagingFolder(
        accessToken,
        appFolderId,
        stagingFolderId,
        userId,
      );
    }
    await setStagingFolderId(userId, stagingFolderId);
  }

  const resolved = { appFolderId, stagingFolderId };
  setCachedFolderIds(cacheKey, resolved);
  return resolved;
}

/**
 * Renames a file or folder in place — the folder's own Drive id never
 * changes, so nothing that points at it (story_drive_folders.drive_folder_id,
 * story_media.drive_processed_file_id) needs updating when this runs.
 */
export async function renameFile(
  accessToken: string,
  fileId: string,
  name: string,
  userId?: string,
): Promise<void> {
  const response = await driveFetch(
    `${DRIVE_FILES_ENDPOINT}/${encodeURIComponent(fileId)}?fields=id`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    },
    accessToken,
    userId,
  );
  if (!response.ok) {
    throw new DriveApiError(
      `Drive file rename failed (${response.status})`,
      response.status,
    );
  }
}

/**
 * Moves a file or folder from one parent to another — Drive v3 models a
 * move as adding the new parent and removing the old one in the same
 * files.update call (a file can technically have multiple parents, but
 * everything this app creates has exactly one).
 */
export async function moveFile(
  accessToken: string,
  fileId: string,
  newParentId: string,
  oldParentId: string,
  userId?: string,
): Promise<void> {
  const params = new URLSearchParams({
    addParents: newParentId,
    removeParents: oldParentId,
    fields: "id",
  });
  const response = await driveFetch(
    `${DRIVE_FILES_ENDPOINT}/${encodeURIComponent(fileId)}?${params.toString()}`,
    { method: "PATCH" },
    accessToken,
    userId,
  );
  if (!response.ok) {
    throw new DriveApiError(
      `Drive file move failed (${response.status})`,
      response.status,
    );
  }
}

/**
 * Renames AND moves a file in one call — used by syncStoryFolder's second
 * pass to both place a file in the story folder and give it its final
 * NN.ext name without two separate round trips.
 */
export async function renameAndMoveFile(
  accessToken: string,
  fileId: string,
  name: string,
  newParentId: string,
  oldParentId: string,
  userId?: string,
): Promise<void> {
  const params = new URLSearchParams({
    addParents: newParentId,
    removeParents: oldParentId,
    fields: "id",
  });
  const response = await driveFetch(
    `${DRIVE_FILES_ENDPOINT}/${encodeURIComponent(fileId)}?${params.toString()}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    },
    accessToken,
    userId,
  );
  if (!response.ok) {
    throw new DriveApiError(
      `Drive file rename+move failed (${response.status})`,
      response.status,
    );
  }
}

/**
 * Lists the direct, non-trashed children of a folder in ONE Drive call —
 * used by lib/story/drive-folders.ts#renumberStoryMedia to resolve every
 * target file's current name/parents at once, instead of one
 * getFileMetadata() round trip per photo (the N-round-trip cost that used
 * to make syncStoryFolder's time grow with story size).
 */
export async function listFolderChildren(
  accessToken: string,
  folderId: string,
  userId?: string,
): Promise<{ id: string; name: string; parents: string[] }[]> {
  const q = `'${folderId}' in parents and trashed = false`;
  const url = `${DRIVE_FILES_ENDPOINT}?q=${encodeURIComponent(q)}&fields=files(id,name,parents)&pageSize=1000&spaces=drive`;
  const response = await driveFetch(url, {}, accessToken, userId);
  if (!response.ok) {
    throw new DriveApiError(
      `Drive folder listing failed (${response.status})`,
      response.status,
    );
  }
  const json = (await response.json()) as DriveFileListResponse;
  return (json.files ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    parents: f.parents ?? [],
  }));
}

export type ResumableSession = { sessionUri: string };

/**
 * Starts a resumable-upload session for a new file in the staging folder,
 * with the `appProperties` finalizeDriveMediaUpload() later verifies
 * against. ALWAYS sends `Origin` — the spike in
 * docs/google-drive-integration.md section 4(a) proved the browser's
 * follow-up PUT is blocked without it, and this header must come from
 * configuration (configuredOrigin()), never from an incoming request's own
 * header. Covered by a unit test asserting this unconditionally.
 */
export async function startResumableUploadSession(
  accessToken: string,
  stagingFolderId: string,
  reservationId: string,
  mimeType: string,
  sizeBytes: number,
  userId?: string,
): Promise<ResumableSession> {
  const response = await driveFetch(
    `${DRIVE_UPLOAD_ENDPOINT}?uploadType=resumable`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": mimeType,
        "X-Upload-Content-Length": String(sizeBytes),
        // See the function doc comment — this is never optional.
        Origin: configuredOrigin(),
      },
      body: JSON.stringify({
        name: `staging-${reservationId}`,
        parents: [stagingFolderId],
        appProperties: {
          kakinotes_stage: "raw",
          kakinotes_reservation: reservationId,
          // The client-DECLARED MIME type, carried through so finalize can
          // pick the right size ceiling (MAX_UPLOAD_BYTES vs the larger
          // MAX_HEIC_UPLOAD_BYTES) before downloading anything — never
          // trusted for anything past that; the real format is sniffed
          // from the downloaded bytes themselves
          // (lib/story/image-pipeline.ts#processImageBytesInMemory).
          kakinotes_declared_mime: mimeType,
        },
      }),
    },
    accessToken,
    userId,
  );
  if (!response.ok) {
    throw new DriveApiError(
      `Drive resumable session start failed (${response.status})`,
      response.status,
    );
  }
  const sessionUri = response.headers.get("location");
  if (!sessionUri) {
    throw new DriveApiError(
      "Drive resumable session start returned no Location header",
    );
  }
  return { sessionUri };
}

export type DriveFileMetadata = {
  id: string;
  name: string;
  size: number;
  parents: string[];
  appProperties: Record<string, string>;
};

/**
 * Fetches a file's real metadata from the Drive API itself — the only
 * source finalizeDriveMediaUpload() trusts for `appProperties`/parent/size,
 * never anything a browser claims about the file id it hands back
 * (Engineering Rule 2).
 */
export async function getFileMetadata(
  accessToken: string,
  fileId: string,
  userId?: string,
): Promise<DriveFileMetadata> {
  const response = await driveFetch(
    `${DRIVE_FILES_ENDPOINT}/${encodeURIComponent(fileId)}?fields=id,name,size,parents,appProperties`,
    {},
    accessToken,
    userId,
  );
  if (!response.ok) {
    throw new DriveApiError(
      `Drive file metadata fetch failed (${response.status})`,
      response.status,
    );
  }
  const json = (await response.json()) as {
    id: string;
    name: string;
    size?: string;
    parents?: string[];
    appProperties?: Record<string, string>;
  };
  return {
    id: json.id,
    name: json.name,
    size: json.size ? Number(json.size) : 0,
    parents: json.parents ?? [],
    appProperties: json.appProperties ?? {},
  };
}

/** Downloads a file's raw bytes. */
export async function downloadFileBytes(
  accessToken: string,
  fileId: string,
  userId?: string,
): Promise<Buffer> {
  const response = await driveFetch(
    `${DRIVE_FILES_ENDPOINT}/${encodeURIComponent(fileId)}?alt=media`,
    {},
    accessToken,
    userId,
  );
  if (!response.ok) {
    throw new DriveApiError(
      `Drive file download failed (${response.status})`,
      response.status,
    );
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Uploads the finished derivative as a NEW file in the real (non-staging)
 * app folder — a simple multipart upload, fine here because this is an
 * OUTBOUND call from our server to Google, never subject to Vercel's
 * inbound request-body ceiling (the reason Option D's raw upload needs a
 * resumable session in the first place). The derivative is always under
 * MAX_PROCESSED_BYTES (8 MiB) regardless.
 */
export async function uploadDerivativeFile(
  accessToken: string,
  folderId: string,
  name: string,
  bytes: Buffer,
  mimeType: string,
  userId?: string,
): Promise<string> {
  const boundary = `kakinotes-${Date.now().toString(36)}`;
  const metadata = JSON.stringify({ name, parents: [folderId] });
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
        `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
      "utf8",
    ),
    bytes,
    Buffer.from(`\r\n--${boundary}--`, "utf8"),
  ]);

  const response = await driveFetch(
    `${DRIVE_UPLOAD_ENDPOINT}?uploadType=multipart&fields=id`,
    {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    },
    accessToken,
    userId,
  );
  if (!response.ok) {
    throw new DriveApiError(
      `Drive derivative upload failed (${response.status})`,
      response.status,
    );
  }
  const json = (await response.json()) as { id: string };
  return json.id;
}

/**
 * Permanently deletes a file — `files.delete`, never `files.update` to
 * trash it. Trashing would leave the raw, GPS-bearing original sitting
 * recoverable in the contributor's Trash for up to Drive's own 30-day
 * default; this is the only call that makes "never persisted" true.
 */
export async function deleteFilePermanently(
  accessToken: string,
  fileId: string,
  userId?: string,
): Promise<void> {
  const response = await driveFetch(
    `${DRIVE_FILES_ENDPOINT}/${encodeURIComponent(fileId)}`,
    { method: "DELETE" },
    accessToken,
    userId,
  );
  // Drive returns 204 on success, and a 404 means it's already gone —
  // both are an acceptable "no longer there" outcome for a delete call.
  if (!response.ok && response.status !== 404) {
    throw new DriveApiError(
      `Drive file delete failed (${response.status})`,
      response.status,
    );
  }
}
