// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/env.server", () => ({
  getDriveEnv: () => ({
    GOOGLE_DRIVE_OAUTH_CLIENT_ID: "test-client-id",
    GOOGLE_DRIVE_OAUTH_CLIENT_SECRET: "test-client-secret",
    GOOGLE_DRIVE_OAUTH_REDIRECT_URI:
      "https://kakinotes.test/account/drive/callback",
    GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
  }),
}));

const readDriveConnection = vi.hoisted(() => vi.fn());
const markDriveConnectionRefreshFailed = vi.hoisted(() =>
  vi.fn(async (_userId: string) => {}),
);

type FakeConnectionState = {
  connectionId: string | null;
  identityToken: string | null;
  status: "active" | "revoked" | "refresh_failed" | null;
  appFolderId: string | null;
  stagingFolderId: string | null;
};

const ACTIVE_STATE: FakeConnectionState = {
  connectionId: "conn-1",
  identityToken: "identity-1",
  status: "active",
  appFolderId: null,
  stagingFolderId: null,
};

const getDriveConnectionState = vi.hoisted(() =>
  vi.fn(async (_userId: string) => ({
    connectionId: "conn-1" as string | null,
    identityToken: "identity-1" as string | null,
    status: "active" as "active" | "revoked" | "refresh_failed" | null,
    appFolderId: null as string | null,
    stagingFolderId: null as string | null,
  })),
);
const setDriveFolderId = vi.hoisted(() =>
  vi.fn(async (_userId: string, _folderId: string) => {}),
);
const setStagingFolderId = vi.hoisted(() =>
  vi.fn(async (_userId: string, _folderId: string) => {}),
);

vi.mock("@/lib/drive/token-store", () => ({
  readDriveConnection,
  markDriveConnectionRefreshFailed,
  getDriveConnectionState,
  setDriveFolderId,
  setStagingFolderId,
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import {
  getAccessToken,
  invalidateAccessToken,
  startResumableUploadSession,
  renameFile,
  moveFile,
  ensureAppFolders,
  __resetDriveClientCachesForTests,
  DriveConnectionError,
} from "@/lib/drive/drive-client";

beforeEach(() => {
  fetchMock.mockReset();
  readDriveConnection.mockReset();
  markDriveConnectionRefreshFailed.mockClear();
  getDriveConnectionState.mockReset();
  getDriveConnectionState.mockResolvedValue({ ...ACTIVE_STATE });
  setDriveFolderId.mockClear();
  setStagingFolderId.mockClear();
  readDriveConnection.mockResolvedValue({
    refreshToken: "1//refresh-token",
    googleAccountEmail: null,
    status: "active",
  });
  // Both in-memory caches are module-level singletons by design (that's
  // the whole performance fix) -- reset them for every identity these
  // tests use between tests so one test's cache hit can't leak into the
  // next.
  __resetDriveClientCachesForTests("user-1");
  __resetDriveClientCachesForTests("user-2");
});

describe("startResumableUploadSession", () => {
  it("always sends the configured Origin header, never one from an incoming request", async () => {
    fetchMock.mockResolvedValue(
      new Response(null, {
        status: 200,
        headers: { Location: "https://upload.example/session-1" },
      }),
    );

    await startResumableUploadSession(
      "access-token",
      "staging-folder-id",
      "reservation-1",
      "image/jpeg",
      12345,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const headers = init.headers as Record<string, string>;
    expect(headers.Origin).toBe("https://kakinotes.test");
  });

  it("returns the session URI from the Location header", async () => {
    fetchMock.mockResolvedValue(
      new Response(null, {
        status: 200,
        headers: { Location: "https://upload.example/session-2" },
      }),
    );

    const { sessionUri } = await startResumableUploadSession(
      "access-token",
      "staging-folder-id",
      "reservation-2",
      "image/jpeg",
      1,
    );
    expect(sessionUri).toBe("https://upload.example/session-2");
  });

  it("throws if Google rejects the session start", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 403 }));
    await expect(
      startResumableUploadSession("token", "folder", "r", "image/jpeg", 1),
    ).rejects.toThrow();
  });
});

describe("renameFile", () => {
  it("PATCHes the file's name only", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: "f1" }), { status: 200 }),
    );
    await renameFile("access-token", "f1", "02.jpg");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/f1");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ name: "02.jpg" });
  });

  it("throws on a non-ok response", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 500 }));
    await expect(renameFile("access-token", "f1", "x")).rejects.toThrow();
  });
});

describe("moveFile", () => {
  it("adds the new parent and removes the old one", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: "f1" }), { status: 200 }),
    );
    await moveFile("access-token", "f1", "new-parent", "old-parent");
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("addParents=new-parent");
    expect(String(url)).toContain("removeParents=old-parent");
  });
});

describe("getAccessToken", () => {
  it("throws DriveConnectionError when there is no connection row at all, without calling Google", async () => {
    getDriveConnectionState.mockResolvedValue({
      connectionId: null,
      identityToken: null,
      status: null,
      appFolderId: null,
      stagingFolderId: null,
    });
    await expect(getAccessToken("user-1")).rejects.toBeInstanceOf(
      DriveConnectionError,
    );
    expect(readDriveConnection).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws DriveConnectionError for a revoked/refresh_failed connection without calling Google", async () => {
    getDriveConnectionState.mockResolvedValue({
      ...ACTIVE_STATE,
      status: "refresh_failed",
    });
    await expect(getAccessToken("user-1")).rejects.toBeInstanceOf(
      DriveConnectionError,
    );
    expect(readDriveConnection).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a fresh access token on a successful refresh", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ access_token: "new-access-token" }), {
        status: 200,
      }),
    );
    const token = await getAccessToken("user-1");
    expect(token).toBe("new-access-token");
  });

  it("marks the connection refresh_failed on invalid_grant and throws", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "invalid_grant" }), {
        status: 400,
      }),
    );
    await expect(getAccessToken("user-1")).rejects.toBeInstanceOf(
      DriveConnectionError,
    );
    expect(markDriveConnectionRefreshFailed).toHaveBeenCalledWith("user-1");
  });

  it("throws DriveApiError (not refresh_failed) for an unrelated refresh failure", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "server_error" }), {
        status: 500,
      }),
    );
    await expect(getAccessToken("user-1")).rejects.toThrow();
    expect(markDriveConnectionRefreshFailed).not.toHaveBeenCalled();
  });
});

describe("getAccessToken -- in-memory cache", () => {
  it("reuses a cached token across calls without re-reading the connection or calling Google again", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ access_token: "token-1", expires_in: 3600 }),
        { status: 200 },
      ),
    );

    const first = await getAccessToken("user-1");
    const second = await getAccessToken("user-1");

    expect(first).toBe("token-1");
    expect(second).toBe("token-1");
    // The one cheap identity-confirming DB read runs on EVERY call, warm
    // or cold -- only the expensive decrypt-read + Google exchange are
    // skipped on the cache hit.
    expect(getDriveConnectionState).toHaveBeenCalledTimes(2);
    expect(readDriveConnection).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refreshes again once the cached token's expiry (minus the safety margin) has passed", async () => {
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ access_token: "token-1", expires_in: 60 }), // 60s, well under the margin
        { status: 200 },
      ),
    );

    await getAccessToken("user-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // The cached entry's expiry is already in the past (60s - 60s margin,
    // clamped to 0) -- the very next call must refresh again.
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ access_token: "token-2", expires_in: 3600 }),
        { status: 200 },
      ),
    );
    const second = await getAccessToken("user-1");

    expect(second).toBe("token-2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.restoreAllMocks();
  });

  it("caches per userId -- a different user always refreshes independently", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ access_token: "token-1", expires_in: 3600 }),
        { status: 200 },
      ),
    );
    await getAccessToken("user-1");
    __resetDriveClientCachesForTests("user-2");

    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ access_token: "token-2", expires_in: 3600 }),
        { status: 200 },
      ),
    );
    const other = await getAccessToken("user-2");

    expect(other).toBe("token-2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

// The bug this section guards against: disconnect, then reconnect with a
// DIFFERENT (or even the same) Google account within the token's ~1h
// lifetime must never keep serving the OLD connection's cached access
// token or folder ids. Both caches are keyed by connection identity
// (userId:connectionId:identityToken), re-derived fresh on every call --
// never trusted from a previous call -- so a changed or vanished identity
// makes the old cache entry simply unreachable.
describe("connection identity changes make stale cache entries unreachable", () => {
  it("reconnecting with a NEW identity is a cache miss -- a fresh token exchange runs", async () => {
    fetchMock.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            access_token: "token-for-old-identity",
            expires_in: 3600,
          }),
          { status: 200 },
        ),
    );
    getDriveConnectionState.mockResolvedValue({ ...ACTIVE_STATE });
    const first = await getAccessToken("user-1");
    expect(first).toBe("token-for-old-identity");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Reconnect: same connection row (same id), but a NEW identity token --
    // exactly what saveDriveConnection() produces on every reconnect, same
    // account or not.
    getDriveConnectionState.mockResolvedValue({
      ...ACTIVE_STATE,
      identityToken: "identity-2-after-reconnect",
    });
    fetchMock.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            access_token: "token-for-new-identity",
            expires_in: 3600,
          }),
          { status: 200 },
        ),
    );

    const second = await getAccessToken("user-1");
    expect(second).toBe("token-for-new-identity");
    // A SECOND real token exchange happened -- the old identity's cached
    // token was never returned for the new connection.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("disconnecting (no connection row) throws -- a previously cached token for the OLD connection is never returned", async () => {
    fetchMock.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            access_token: "token-before-disconnect",
            expires_in: 3600,
          }),
          { status: 200 },
        ),
    );
    const cached = await getAccessToken("user-1");
    expect(cached).toBe("token-before-disconnect");

    // Disconnected: the row is gone (token-store.ts's deleteDriveConnection
    // already invalidates the same-instance cache too, but this proves the
    // identity check ALONE is sufficient even if that invalidation were
    // somehow skipped).
    getDriveConnectionState.mockResolvedValue({
      connectionId: null,
      identityToken: null,
      status: null,
      appFolderId: null,
      stagingFolderId: null,
    });

    await expect(getAccessToken("user-1")).rejects.toBeInstanceOf(
      DriveConnectionError,
    );
  });

  it("ensureAppFolders: reconnecting with a NEW identity is a folder-cache miss too", async () => {
    getDriveConnectionState.mockResolvedValue({
      ...ACTIVE_STATE,
      appFolderId: "old-app-folder",
      stagingFolderId: "old-staging-folder",
    });
    const first = await ensureAppFolders("user-1", "access-token");
    expect(first).toEqual({
      appFolderId: "old-app-folder",
      stagingFolderId: "old-staging-folder",
    });
    expect(fetchMock).not.toHaveBeenCalled();

    // Reconnected under a new identity, with a different (newly resolved)
    // set of stored folder ids -- the OLD cached ids must not leak through.
    getDriveConnectionState.mockResolvedValue({
      ...ACTIVE_STATE,
      identityToken: "identity-2-after-reconnect",
      appFolderId: "new-app-folder",
      stagingFolderId: "new-staging-folder",
    });
    const second = await ensureAppFolders("user-1", "access-token");
    expect(second).toEqual({
      appFolderId: "new-app-folder",
      stagingFolderId: "new-staging-folder",
    });
  });

  it("ensureAppFolders: disconnecting throws before either cache is touched", async () => {
    getDriveConnectionState.mockResolvedValue({
      connectionId: null,
      identityToken: null,
      status: null,
      appFolderId: null,
      stagingFolderId: null,
    });
    await expect(
      ensureAppFolders("user-1", "access-token"),
    ).rejects.toBeInstanceOf(DriveConnectionError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("401 drop-cached-token-and-retry-once", () => {
  it("renameFile: drops the cache and retries once on a 401, succeeding with the fresh token", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ access_token: "fresh-token", expires_in: 3600 }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "f1" }), { status: 200 }),
      );

    await renameFile("stale-token", "f1", "02.jpg", "user-1");

    expect(fetchMock).toHaveBeenCalledTimes(3);
    // 1st call: the rename attempt with the stale token (401).
    // 2nd call: the token refresh.
    // 3rd call: the rename retried with the fresh token.
    const retryInit = fetchMock.mock.calls[2][1] as RequestInit;
    const headers = retryInit.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer fresh-token");
  });

  it("does not retry when no userId is given -- a 401 just throws", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
    await expect(renameFile("stale-token", "f1", "02.jpg")).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("invalidateAccessToken forces the next getAccessToken call to refresh", async () => {
    fetchMock.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({ access_token: "token-1", expires_in: 3600 }),
          { status: 200 },
        ),
    );
    await getAccessToken("user-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    invalidateAccessToken("user-1");
    await getAccessToken("user-1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("ensureAppFolders -- stored ids skip Drive search calls entirely", () => {
  it("makes ZERO Drive calls when both ids are already stored", async () => {
    getDriveConnectionState.mockResolvedValue({
      ...ACTIVE_STATE,
      appFolderId: "stored-app-folder",
      stagingFolderId: "stored-staging-folder",
    });

    const result = await ensureAppFolders("user-1", "access-token");

    expect(result).toEqual({
      appFolderId: "stored-app-folder",
      stagingFolderId: "stored-staging-folder",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still makes the one cheap identity read on a cache hit, but no Drive calls", async () => {
    getDriveConnectionState.mockResolvedValue({
      ...ACTIVE_STATE,
      appFolderId: "stored-app-folder",
      stagingFolderId: "stored-staging-folder",
    });

    await ensureAppFolders("user-1", "access-token");
    getDriveConnectionState.mockClear();
    await ensureAppFolders("user-1", "access-token");

    expect(getDriveConnectionState).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to find-or-create (Drive calls) only when an id is missing", async () => {
    getDriveConnectionState.mockResolvedValue({ ...ACTIVE_STATE });
    // findFolder (search) for Kakinotes -> not found -> createFolder.
    // findFolder for .staging -> not found -> createFolder. Legacy cleanup
    // searches (child-of-Kakinotes, top-level) both find nothing.
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes("q=") && !u.includes("fields=files(id)")) {
        return new Response(JSON.stringify({ files: [] }), { status: 200 });
      }
      if (u.includes("fields=files(id)")) {
        return new Response(JSON.stringify({ files: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({ id: "created-folder" }), {
        status: 200,
      });
    });

    const result = await ensureAppFolders("user-1", "access-token");

    expect(result.appFolderId).toBe("created-folder");
    expect(result.stagingFolderId).toBe("created-folder");
    expect(setDriveFolderId).toHaveBeenCalledWith("user-1", "created-folder");
    expect(setStagingFolderId).toHaveBeenCalledWith("user-1", "created-folder");
  });
});

describe("ensureAppFolders -- one-time legacy staging folder cleanup", () => {
  // Query-string encoding of the `q` param makes asserting on the raw URL
  // fragile; these tests key off the mock's call ORDER and `method`
  // instead, and drive each files.list/files.create/files.delete response
  // from a small sequence rather than string-matching the query.
  function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status });
  }

  it("deletes an empty legacy staging folder found as a CHILD of Kakinotes (not just top-level), only ONCE", async () => {
    getDriveConnectionState.mockResolvedValue({
      ...ACTIVE_STATE,
      appFolderId: "kakinotes-folder",
      stagingFolderId: null, // never resolved before -- triggers the cleanup
    });

    const calls: { method: string }[] = [];
    let listCallIndex = 0;
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ method });
      if (method === "GET" || !method) {
        listCallIndex += 1;
        if (listCallIndex === 1) {
          // find-or-create .staging: not found.
          return jsonResponse({ files: [] });
        }
        if (listCallIndex === 2) {
          // legacy search, child of Kakinotes: FOUND.
          return jsonResponse({
            files: [{ id: "legacy-child-id", name: "Kakinotes staging" }],
          });
        }
        if (listCallIndex === 3) {
          // legacy search, top-level root: not found.
          return jsonResponse({ files: [] });
        }
        if (listCallIndex === 4) {
          // isFolderEmpty check on legacy-child-id: empty.
          return jsonResponse({ files: [] });
        }
      }
      if (method === "DELETE") {
        return new Response(null, { status: 204 });
      }
      // createFolder for .staging.
      return jsonResponse({ id: "new-staging-id" });
    });

    const result = await ensureAppFolders("user-1", "access-token");

    expect(result.stagingFolderId).toBe("new-staging-id");
    expect(calls.some((c) => c.method === "DELETE")).toBe(true);
    expect(setStagingFolderId).toHaveBeenCalledWith("user-1", "new-staging-id");

    // Second call for the SAME user, now with staging_folder_id stored --
    // the cleanup (and every Drive search) must not run again.
    getDriveConnectionState.mockResolvedValue({
      ...ACTIVE_STATE,
      appFolderId: "kakinotes-folder",
      stagingFolderId: "new-staging-id",
    });
    fetchMock.mockClear();
    __resetDriveClientCachesForTests("user-1");

    const second = await ensureAppFolders("user-1", "access-token");
    expect(second).toEqual({
      appFolderId: "kakinotes-folder",
      stagingFolderId: "new-staging-id",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("leaves a non-empty legacy staging folder alone", async () => {
    getDriveConnectionState.mockResolvedValue({
      ...ACTIVE_STATE,
      appFolderId: "kakinotes-folder",
      stagingFolderId: null,
    });

    let listCallIndex = 0;
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (method === "GET" || !method) {
        listCallIndex += 1;
        if (listCallIndex === 1) return jsonResponse({ files: [] }); // .staging not found
        if (listCallIndex === 2) {
          return jsonResponse({
            files: [{ id: "legacy-id", name: "Kakinotes staging" }],
          });
        }
        if (listCallIndex === 3) return jsonResponse({ files: [] }); // top-level: not found
        if (listCallIndex === 4) {
          // isFolderEmpty: NOT empty.
          return jsonResponse({ files: [{ id: "some-abandoned-file" }] });
        }
      }
      if (method === "DELETE") {
        throw new Error("must not delete a non-empty legacy folder");
      }
      return jsonResponse({ id: "new-staging-id" });
    });

    await ensureAppFolders("user-1", "access-token");
    // No assertion needed beyond "didn't throw" -- the DELETE branch
    // throwing would have failed this test.
  });
});
