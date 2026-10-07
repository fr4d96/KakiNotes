// @vitest-environment node
//
// Same "server-only needs mocking under Vitest" reasoning as
// lib/story/image-pipeline.test.ts -- server-only's package code throws
// unconditionally outside Next's own bundler.
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const envState = vi.hoisted(() => ({
  key: Buffer.alloc(32, 7).toString("base64"),
}));

vi.mock("@/lib/env.server", () => ({
  getDriveEnv: () => ({
    GOOGLE_DRIVE_OAUTH_CLIENT_ID: "test-client-id",
    GOOGLE_DRIVE_OAUTH_CLIENT_SECRET: "test-client-secret",
    GOOGLE_DRIVE_OAUTH_REDIRECT_URI:
      "https://kakinotes.test/account/drive/callback",
    GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY: envState.key,
  }),
  isDriveConfigured: () => true,
}));

// In-memory fake for contributor_drive_connections, one row per user_id --
// enough to exercise saveDriveConnection/readDriveConnection/
// deleteDriveConnection without a real database.
type FakeRow = {
  id: string;
  user_id: string;
  encrypted_refresh_token: string;
  token_iv: string;
  token_auth_tag: string;
  encryption_key_version: number;
  google_account_email: string | null;
  google_account_sub: string | null;
  status: string;
};

const rows = new Map<string, FakeRow>();

const fakeAdmin = {
  from: (table: string) => {
    if (table !== "contributor_drive_connections") {
      throw new Error(`unexpected table ${table}`);
    }
    return {
      upsert: async (row: Record<string, unknown>) => {
        rows.set(
          row.user_id as string,
          {
            id: `id-${row.user_id}`,
            ...row,
          } as FakeRow,
        );
        return { error: null };
      },
      select: (_cols: string) => ({
        eq: (_col: string, value: string) => ({
          maybeSingle: async () => ({
            data: rows.get(value) ?? null,
            error: null,
          }),
        }),
      }),
      delete: () => ({
        eq: async (_col: string, value: string) => {
          rows.delete(value);
          return { error: null };
        },
      }),
    };
  },
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => fakeAdmin,
}));

import {
  encryptRefreshToken,
  decryptRefreshToken,
  saveDriveConnection,
  readDriveConnection,
  deleteDriveConnection,
} from "@/lib/drive/token-store";

beforeEach(() => {
  rows.clear();
  envState.key = Buffer.alloc(32, 7).toString("base64");
});

describe("encryptRefreshToken / decryptRefreshToken", () => {
  it("round-trips a plaintext refresh token", () => {
    const encrypted = encryptRefreshToken("1//my-secret-refresh-token");
    expect(decryptRefreshToken(encrypted)).toBe("1//my-secret-refresh-token");
  });

  it("uses a fresh random IV every call", () => {
    const a = encryptRefreshToken("same-plaintext");
    const b = encryptRefreshToken("same-plaintext");
    expect(a.iv.equals(b.iv)).toBe(false);
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
  });

  it("fails to decrypt when the ciphertext is tampered with", () => {
    const encrypted = encryptRefreshToken("a-refresh-token");
    const tampered = {
      ...encrypted,
      ciphertext: Buffer.from(encrypted.ciphertext),
    };
    tampered.ciphertext[0] = tampered.ciphertext[0] ^ 0xff;
    expect(() => decryptRefreshToken(tampered)).toThrow();
  });

  it("fails to decrypt when the auth tag is tampered with", () => {
    const encrypted = encryptRefreshToken("a-refresh-token");
    const tampered = {
      ...encrypted,
      authTag: Buffer.from(encrypted.authTag),
    };
    tampered.authTag[0] = tampered.authTag[0] ^ 0xff;
    expect(() => decryptRefreshToken(tampered)).toThrow();
  });

  it("fails to decrypt under a different key", () => {
    const encrypted = encryptRefreshToken("a-refresh-token");
    envState.key = Buffer.alloc(32, 9).toString("base64");
    expect(() => decryptRefreshToken(encrypted)).toThrow();
  });

  it("rejects an unsupported key version before touching the cipher", () => {
    const encrypted = encryptRefreshToken("a-refresh-token");
    expect(() => decryptRefreshToken({ ...encrypted, keyVersion: 2 })).toThrow(
      /key_version/,
    );
  });
});

describe("saveDriveConnection / readDriveConnection / deleteDriveConnection", () => {
  it("saves, reads back (decrypted), and deletes a connection", async () => {
    await saveDriveConnection({
      userId: "user-1",
      refreshToken: "1//refresh-token-abc",
      googleAccountEmail: "person@example.com",
      googleAccountSub: "1234567890",
    });

    const read = await readDriveConnection("user-1");
    expect(read).not.toBeNull();
    expect(read?.refreshToken).toBe("1//refresh-token-abc");
    expect(read?.googleAccountEmail).toBe("person@example.com");
    expect(read?.status).toBe("active");

    await deleteDriveConnection("user-1");
    expect(await readDriveConnection("user-1")).toBeNull();
  });

  it("returns null for a user with no connection", async () => {
    expect(await readDriveConnection("nobody")).toBeNull();
  });

  it("never stores the plaintext refresh token", async () => {
    await saveDriveConnection({
      userId: "user-2",
      refreshToken: "1//super-secret-value",
      googleAccountEmail: null,
      googleAccountSub: null,
    });
    const row = rows.get("user-2");
    expect(row?.encrypted_refresh_token).not.toContain("super-secret-value");
  });

  it("reconnecting replaces the previous token rather than adding a row", async () => {
    await saveDriveConnection({
      userId: "user-3",
      refreshToken: "1//first-token",
      googleAccountEmail: null,
      googleAccountSub: null,
    });
    await saveDriveConnection({
      userId: "user-3",
      refreshToken: "1//second-token",
      googleAccountEmail: null,
      googleAccountSub: null,
    });
    expect(rows.size).toBe(1);
    const read = await readDriveConnection("user-3");
    expect(read?.refreshToken).toBe("1//second-token");
  });
});
