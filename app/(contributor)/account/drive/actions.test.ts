import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

let currentUser: { id: string } | null = { id: "user-1" };
vi.mock("@/lib/auth/get-current-user", () => ({
  getCurrentUser: async () => currentUser,
}));

let driveConfigured = true;
vi.mock("@/lib/env.server", () => ({
  getDriveEnv: () => ({
    GOOGLE_DRIVE_OAUTH_CLIENT_ID: "client-id",
    GOOGLE_DRIVE_OAUTH_CLIENT_SECRET: "client-secret",
    GOOGLE_DRIVE_OAUTH_REDIRECT_URI:
      "https://kakinotes.test/account/drive/callback",
    GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
  }),
  isDriveConfigured: () => driveConfigured,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let existingConnection: { refreshToken: string } | null = {
  refreshToken: "1//existing-refresh-token",
};
const readDriveConnection = vi.fn(
  async (_userId: string) => existingConnection,
);
const deleteDriveConnection = vi.fn(async (_userId: string) => {});
vi.mock("@/lib/drive/token-store", () => ({
  readDriveConnection: (userId: string) => readDriveConnection(userId),
  deleteDriveConnection: (userId: string) => deleteDriveConnection(userId),
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import { disconnectDriveAction } from "@/app/(contributor)/account/drive/actions";

function formData(entries: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    fd.set(key, value);
  }
  return fd;
}

beforeEach(() => {
  currentUser = { id: "user-1" };
  driveConfigured = true;
  existingConnection = { refreshToken: "1//existing-refresh-token" };
  readDriveConnection.mockClear();
  deleteDriveConnection.mockClear();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
});

describe("disconnectDriveAction", () => {
  it("refuses without the confirmation field, and deletes nothing", async () => {
    const result = await disconnectDriveAction({}, formData({}));
    expect(result.error).toBeTruthy();
    expect(deleteDriveConnection).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses when confirmed is present but not the literal 'true'", async () => {
    const result = await disconnectDriveAction(
      {},
      formData({ confirmed: "yes" }),
    );
    expect(result.error).toBeTruthy();
    expect(deleteDriveConnection).not.toHaveBeenCalled();
  });

  it("requires a signed-in caller", async () => {
    currentUser = null;
    const result = await disconnectDriveAction(
      {},
      formData({ confirmed: "true" }),
    );
    expect(result.error).toBeTruthy();
    expect(deleteDriveConnection).not.toHaveBeenCalled();
  });

  it("never trusts a client-supplied user id -- only the server session's", async () => {
    const result = await disconnectDriveAction(
      {},
      formData({ confirmed: "true", userId: "someone-elses-id" }),
    );
    expect(result.success).toBeTruthy();
    expect(deleteDriveConnection).toHaveBeenCalledWith("user-1");
  });

  it("revokes at Google then deletes the local row on success", async () => {
    const result = await disconnectDriveAction(
      {},
      formData({ confirmed: "true" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://oauth2.googleapis.com/revoke",
      expect.objectContaining({ method: "POST" }),
    );
    expect(deleteDriveConnection).toHaveBeenCalledWith("user-1");
    expect(result.success).toBeTruthy();
  });

  it("still deletes the local row when Google's revoke call fails", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 500 }));
    const result = await disconnectDriveAction(
      {},
      formData({ confirmed: "true" }),
    );
    expect(deleteDriveConnection).toHaveBeenCalledWith("user-1");
    expect(result.success).toBeTruthy();
  });

  it("still deletes the local row when the revoke request throws", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    const result = await disconnectDriveAction(
      {},
      formData({ confirmed: "true" }),
    );
    expect(deleteDriveConnection).toHaveBeenCalledWith("user-1");
    expect(result.success).toBeTruthy();
  });
});
