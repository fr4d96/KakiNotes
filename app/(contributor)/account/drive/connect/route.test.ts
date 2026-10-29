// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

let currentUser: { id: string } | null = { id: "user-1" };
vi.mock("@/lib/auth/get-current-user", () => ({
  getCurrentUser: async () => currentUser,
}));

let driveConfigured = true;
vi.mock("@/lib/env.server", () => ({
  getDriveEnv: () => ({
    GOOGLE_DRIVE_OAUTH_CLIENT_ID: "test-client-id",
    GOOGLE_DRIVE_OAUTH_CLIENT_SECRET: "test-client-secret",
    GOOGLE_DRIVE_OAUTH_REDIRECT_URI:
      "https://kakinotes.test/account/drive/callback",
    GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
  }),
  isDriveConfigured: () => driveConfigured,
}));

import { GET } from "@/app/(contributor)/account/drive/connect/route";

beforeEach(() => {
  currentUser = { id: "user-1" };
  driveConfigured = true;
});

describe("GET /account/drive/connect", () => {
  it("redirects a signed-out caller to sign-in", async () => {
    currentUser = null;
    const response = await GET(
      new NextRequest("https://kakinotes.test/account/drive/connect"),
    );
    expect(response.headers.get("location")).toContain("/sign-in");
  });

  it("redirects to 'unavailable' when not configured here", async () => {
    driveConfigured = false;
    const response = await GET(
      new NextRequest("https://kakinotes.test/account/drive/connect"),
    );
    expect(response.headers.get("location")).toContain("drive=unavailable");
  });

  it("redirects to Google with only the drive.file scope", async () => {
    const response = await GET(
      new NextRequest("https://kakinotes.test/account/drive/connect"),
    );
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.origin + location.pathname).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    expect(location.searchParams.get("scope")).toBe(
      "https://www.googleapis.com/auth/drive.file",
    );
    expect(location.searchParams.get("access_type")).toBe("offline");
    expect(location.searchParams.get("prompt")).toBe("select_account consent");
    expect(location.searchParams.get("redirect_uri")).toBe(
      "https://kakinotes.test/account/drive/callback",
    );
  });

  it("sets a short-lived, httpOnly, path-scoped state cookie matching the redirect's state param", async () => {
    const response = await GET(
      new NextRequest("https://kakinotes.test/account/drive/connect"),
    );
    const location = new URL(response.headers.get("location") ?? "");
    const state = location.searchParams.get("state");
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`drive_oauth_state=${state}`);
    expect(setCookie.toLowerCase()).toContain("httponly");
    expect(setCookie.toLowerCase()).toContain("samesite=lax");
    expect(setCookie).toContain("Path=/account/drive");
  });
});
