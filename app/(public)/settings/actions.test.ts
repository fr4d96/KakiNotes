import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetCurrentUser = vi.fn();
vi.mock("@/lib/auth/get-current-user", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const invalidate = vi.fn();
vi.mock("@/lib/story/public-cache", () => ({
  invalidateContributorPublicCache: (slug: string) => invalidate(slug),
}));

type Call = { table: string; update: unknown; eq: unknown[] };
const calls: Call[] = [];
let contributorRow: { public_slug: string | null } | null = null;
let failTable: string | null = null;

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => ({
      update: (update: unknown) => ({
        eq: (...eq: unknown[]) => {
          calls.push({ table, update, eq });
          const error = failTable === table ? { message: "nope" } : null;
          return Object.assign(Promise.resolve({ error }), {
            select: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: contributorRow, error }),
            }),
          });
        },
      }),
    }),
  }),
}));

import { setAvatarAction } from "./actions";

const user = { id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" };

beforeEach(() => {
  calls.length = 0;
  contributorRow = null;
  failTable = null;
  invalidate.mockClear();
  mockGetCurrentUser.mockReset();
});

describe("setAvatarAction", () => {
  it("writes the caller's own profile and identity, never a client-chosen row", async () => {
    mockGetCurrentUser.mockResolvedValue(user);
    contributorRow = { public_slug: "casey" };

    const result = await setAvatarAction("🥝");

    expect(result).toEqual({ ok: true, avatarEmoji: "🥝" });
    expect(calls).toEqual([
      {
        table: "profiles",
        update: { avatar_emoji: "🥝" },
        eq: ["id", user.id],
      },
      {
        table: "contributors",
        update: { avatar_emoji: "🥝" },
        eq: ["linked_user_id", user.id],
      },
    ]);
    expect(invalidate).toHaveBeenCalledWith("casey");
  });

  it("clears the avatar with an empty value", async () => {
    mockGetCurrentUser.mockResolvedValue(user);
    const result = await setAvatarAction("");
    expect(result).toEqual({ ok: true, avatarEmoji: null });
    expect(calls[0].update).toEqual({ avatar_emoji: null });
  });

  it("refuses anything outside the fixed set, before touching the database", async () => {
    mockGetCurrentUser.mockResolvedValue(user);
    expect(await setAvatarAction("💀")).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(await setAvatarAction({ emoji: "🥝" })).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(calls).toEqual([]);
  });

  it("refuses a signed-out caller", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    expect(await setAvatarAction("🥝")).toEqual({
      ok: false,
      reason: "signed-out",
    });
    expect(calls).toEqual([]);
  });

  it("reports a failed write", async () => {
    mockGetCurrentUser.mockResolvedValue(user);
    failTable = "contributors";
    expect(await setAvatarAction("🥝")).toEqual({
      ok: false,
      reason: "failed",
    });
  });
});
