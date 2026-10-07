// @vitest-environment node
//
// Only the Drive env schema added to lib/env.server.ts for this slice --
// the public/admin schemas already covered elsewhere are untouched. Each
// test re-imports the module fresh (vi.resetModules) so getDriveEnv()'s
// internal cache from one test can never leak into the next -- it only
// caches on a SUCCESSFUL parse, so a stale cached value would otherwise
// silently make a later "this should fail" test pass for the wrong reason.
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

const VALID_32_BYTE_KEY = Buffer.alloc(32, 1).toString("base64");

const BASE_ENV = {
  GOOGLE_DRIVE_OAUTH_CLIENT_ID: "client-id",
  GOOGLE_DRIVE_OAUTH_CLIENT_SECRET: "client-secret",
  GOOGLE_DRIVE_OAUTH_REDIRECT_URI:
    "https://kakinotes.test/account/drive/callback",
  GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY: VALID_32_BYTE_KEY,
};

// lib/env.server.ts validates the public Supabase schema eagerly, at
// module-eval time, regardless of what this file is actually testing --
// every other test file that touches this module mocks it wholesale
// instead of exercising it for real (see lib/story/image-pipeline.test.ts).
// This file deliberately imports the REAL module to test the real Drive
// schema, so it has to satisfy that unrelated top-level check too. These
// values are not read for anything -- harmless well-formed placeholders.
const PUBLIC_ENV_STUBS = {
  NEXT_PUBLIC_SUPABASE_URL: "https://stub.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "stub-publishable-key",
};

function setDriveEnv(overrides: Partial<typeof BASE_ENV> = {}) {
  for (const [key, value] of Object.entries(PUBLIC_ENV_STUBS)) {
    vi.stubEnv(key, value);
  }
  const merged = { ...BASE_ENV, ...overrides };
  for (const [key, value] of Object.entries(merged)) {
    vi.stubEnv(key, value);
  }
}

function clearDriveEnv() {
  for (const [key, value] of Object.entries(PUBLIC_ENV_STUBS)) {
    vi.stubEnv(key, value);
  }
  for (const key of Object.keys(BASE_ENV)) {
    vi.stubEnv(key, undefined as unknown as string);
    delete process.env[key];
  }
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getDriveEnv / isDriveConfigured", () => {
  it("parses successfully with a valid 32-byte base64 key", async () => {
    setDriveEnv();
    const { getDriveEnv, isDriveConfigured } = await import("@/lib/env.server");
    expect(isDriveConfigured()).toBe(true);
    expect(getDriveEnv().GOOGLE_DRIVE_OAUTH_CLIENT_ID).toBe("client-id");
  });

  it("rejects a key that is not 32 bytes once base64-decoded", async () => {
    setDriveEnv({
      GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(16, 1).toString("base64"),
    });
    const { getDriveEnv, isDriveConfigured } = await import("@/lib/env.server");
    expect(isDriveConfigured()).toBe(false);
    expect(() => getDriveEnv()).toThrow();
  });

  it("rejects a key that isn't valid base64 at all", async () => {
    setDriveEnv({ GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY: "not valid base64!!" });
    const { isDriveConfigured } = await import("@/lib/env.server");
    // Node's Buffer.from(..., "base64") doesn't throw on odd input -- it
    // decodes leniently -- so this only has to prove the DECODED length
    // check still rejects whatever comes out, not that decoding itself
    // throws.
    expect(isDriveConfigured()).toBe(false);
  });

  it("reports not configured when every var is absent", async () => {
    clearDriveEnv();
    const { isDriveConfigured, getDriveEnv } = await import("@/lib/env.server");
    expect(isDriveConfigured()).toBe(false);
    expect(() => getDriveEnv()).toThrow();
  });

  it("reports not configured when the redirect URI isn't a URL", async () => {
    setDriveEnv({ GOOGLE_DRIVE_OAUTH_REDIRECT_URI: "not-a-url" });
    const { isDriveConfigured } = await import("@/lib/env.server");
    expect(isDriveConfigured()).toBe(false);
  });
});
