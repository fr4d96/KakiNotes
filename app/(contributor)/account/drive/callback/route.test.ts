// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

let currentUser: { id: string } | null = { id: "user-1" };

vi.mock("@/lib/auth/get-current-user", () => ({
  getCurrentUser: async () => currentUser,
}));

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

let driveConfigured = true;

const saveDriveConnection = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/drive/token-store", () => ({
  saveDriveConnection,
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import { GET } from "@/app/(contributor)/account/drive/callback/route";

const STATE_COOKIE = "drive_oauth_state";

function callbackRequest(params: Record<string, string>, cookieState?: string) {
  const url = new URL("https://kakinotes.test/account/drive/callback");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const headers = new Headers();
  if (cookieState !== undefined) {
    headers.set("cookie", `${STATE_COOKIE}=${cookieState}`);
  }
  return new NextRequest(url, { headers });
}

beforeEach(() => {
  currentUser = { id: "user-1" };
  driveConfigured = true;
  saveDriveConnection.mockClear();
  fetchMock.mockReset();
});

describe("GET /account/drive/callback", () => {
  it("redirects signed-out callers to sign-in without touching state", async () => {
    currentUser = null;
    const response = await GET(
      callbackRequest({ code: "abc", state: "s" }, "s"),
    );
    expect(response.headers.get("location")).toContain("/sign-in");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a missing state cookie and makes no token request", async () => {
    const response = await GET(
      callbackRequest({ code: "abc", state: "good-state" }),
    );
    expect(response.headers.get("location")).toContain("drive=failed");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(saveDriveConnection).not.toHaveBeenCalled();
  });

  it("rejects a mismatched state and makes no token request", async () => {
    const response = await GET(
      callbackRequest({ code: "abc", state: "attacker-state" }, "real-state"),
    );
    expect(response.headers.get("location")).toContain("drive=failed");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(saveDriveConnection).not.toHaveBeenCalled();
  });

  it("handles access_denied with no database write and no token request", async () => {
    const response = await GET(
      callbackRequest(
        { error: "access_denied", state: "real-state" },
        "real-state",
      ),
    );
    expect(response.headers.get("location")).toContain("drive=cancelled");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(saveDriveConnection).not.toHaveBeenCalled();
  });

  it("clears the state cookie on both success and failure paths", async () => {
    const response = await GET(
      callbackRequest(
        { error: "access_denied", state: "real-state" },
        "real-state",
      ),
    );
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(STATE_COOKIE);
  });

  it("redirects to 'unavailable' when Drive isn't configured here", async () => {
    driveConfigured = false;
    const response = await GET(
      callbackRequest({ code: "abc", state: "real-state" }, "real-state"),
    );
    expect(response.headers.get("location")).toContain("drive=unavailable");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("exchanges the code and saves the connection on a clean success", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("oauth2.googleapis.com/token")) {
        return new Response(
          JSON.stringify({
            access_token: "access-token-value",
            refresh_token: "refresh-token-value",
          }),
          { status: 200 },
        );
      }
      if (url.includes("drive/v3/about")) {
        return new Response(
          JSON.stringify({ user: { emailAddress: "person@example.com" } }),
          { status: 200 },
        );
      }
      throw new Error(`unexpected fetch to ${url}`);
    });

    const response = await GET(
      callbackRequest({ code: "good-code", state: "real-state" }, "real-state"),
    );

    expect(saveDriveConnection).toHaveBeenCalledWith({
      userId: "user-1",
      refreshToken: "refresh-token-value",
      googleAccountEmail: "person@example.com",
      googleAccountSub: null,
    });
    expect(response.headers.get("location")).toContain("drive=connected");
  });

  it("fails without writing anything when Google returns no refresh_token", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("oauth2.googleapis.com/token")) {
        return new Response(
          JSON.stringify({ access_token: "access-token-value" }),
          { status: 200 },
        );
      }
      throw new Error(`unexpected fetch to ${url}`);
    });

    const response = await GET(
      callbackRequest({ code: "good-code", state: "real-state" }, "real-state"),
    );

    expect(saveDriveConnection).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toContain("drive=failed");
  });

  it("redirects to 'failed' instead of erroring when saving the connection fails", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("oauth2.googleapis.com/token")) {
        return new Response(
          JSON.stringify({
            access_token: "access-token-value",
            refresh_token: "refresh-token-value",
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 200 });
    });
    saveDriveConnection.mockRejectedValueOnce(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await GET(
      callbackRequest({ code: "good-code", state: "real-state" }, "real-state"),
    );

    expect(response.headers.get("location")).toContain("drive=failed");
  });
});
