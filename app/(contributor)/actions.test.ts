import { describe, expect, it, vi, beforeEach } from "vitest";

const mockGetCurrentUser = vi.fn();
vi.mock("@/lib/auth/get-current-user", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));
// The public-cache helper is server-only and the public-queries module it
// imports for its tags builds Supabase clients at import time; neither is
// under test here.
vi.mock("@/lib/story/public-cache", () => ({
  invalidateContributorPublicCache: vi.fn(),
}));
vi.mock("@/lib/story/public-queries", () => ({
  PUBLIC_CONTRIBUTORS_TAG: "public-contributors",
}));

// Records every call made through the chainable query-builder mock so tests
// can assert exactly which row was targeted / what was written, without a
// live database. This is what lets us verify ownership scoping (never a
// client-supplied id) as a pure unit test, per docs/architecture.md's
// established pattern of testing decision logic instead of rendering
// Server Components against a real Supabase instance.
const calls: { method: string; args: unknown[] }[] = [];
let updateResult: { error: unknown } = { error: null };
type InsertResult = { error: unknown };
// A function answers each insert from its payload (used to make an
// auto-made page address clash, then succeed on the next candidate).
let insertResult:
  InsertResult | ((payload: Record<string, unknown>) => InsertResult) = {
  error: null,
};
// What the caller's own profiles row holds (createOwnContributorAction reads
// its avatar_emoji to start the new identity with it).
let profileRow: { avatar_emoji: string | null } | null = null;

function chain() {
  const proxy: Record<string, unknown> = {
    update: (...args: unknown[]) => {
      calls.push({ method: "update", args });
      return proxy;
    },
    insert: (...args: unknown[]) => {
      calls.push({ method: "insert", args });
      return Promise.resolve(
        typeof insertResult === "function"
          ? insertResult(args[0] as Record<string, unknown>)
          : insertResult,
      );
    },
    select: (...args: unknown[]) => {
      calls.push({ method: "select", args });
      return proxy;
    },
    eq: (...args: unknown[]) => {
      calls.push({ method: "eq", args });
      return Object.assign(Promise.resolve(updateResult), {
        maybeSingle: () => Promise.resolve({ data: profileRow }),
      });
    },
  };
  return proxy;
}

const mockFrom = vi.fn(() => chain());
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: mockFrom }),
}));

import {
  updateProfileAction,
  createOwnContributorAction,
  updateOwnContributorAction,
} from "./actions";

const user = { id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" };
const attacker = { id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" };

function formData(entries: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    fd.set(key, value);
  }
  return fd;
}

beforeEach(() => {
  calls.length = 0;
  updateResult = { error: null };
  insertResult = { error: null };
  profileRow = null;
  mockFrom.mockClear();
  mockGetCurrentUser.mockReset();
});

describe("updateProfileAction", () => {
  it("scopes the update to the authenticated user's own id, never a client-supplied one", async () => {
    mockGetCurrentUser.mockResolvedValue(user);

    await updateProfileAction(
      {},
      formData({
        displayName: "Casey",
        homeCountryCode: "MY",
        // Even if a tampered client tried to smuggle a different id in, the
        // action never reads an "id" field from the form at all.
        id: attacker.id,
      }),
    );

    const eqCall = calls.find((c) => c.method === "eq");
    expect(eqCall?.args).toEqual(["id", user.id]);
  });

  it("rejects when there is no authenticated user", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const result = await updateProfileAction(
      {},
      formData({ displayName: "Casey", homeCountryCode: "MY" }),
    );

    expect(result.error).toBeTruthy();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("rejects invalid input before touching the database", async () => {
    mockGetCurrentUser.mockResolvedValue(user);

    const result = await updateProfileAction(
      {},
      formData({ displayName: "", homeCountryCode: "MY" }),
    );

    expect(result.error).toBeTruthy();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  // Replaces the old "requires a public slug before enabling the public
  // profile toggle" case. That rule did not disappear -- it moved to
  // create/updateOwnContributorAction along with the toggle itself
  // (20260910090000). What matters on THIS action now is the opposite
  // guarantee: a stale form still posting the old public fields must not be
  // able to write any of them back onto profiles.
  it("writes only the display name, ignoring smuggled public identity fields", async () => {
    mockGetCurrentUser.mockResolvedValue(user);

    const result = await updateProfileAction(
      {},
      formData({
        displayName: "Casey",
        bio: "smuggled",
        homeCountryCode: "MY",
        publicProfileEnabled: "on",
        publicSlug: "casey-nz-2024",
        avatarEmoji: "🥝",
      }),
    );

    expect(result.error).toBeUndefined();
    const updateCall = calls.find((c) => c.method === "update");
    expect(updateCall?.args).toEqual([{ display_name: "Casey" }]);
  });
});

describe("createOwnContributorAction", () => {
  // The avatar moved to Settings (2026-11-18): a new identity starts with
  // the avatar already saved on the account, never one posted by the form.
  it("starts the identity with the account's avatar, ignoring a posted one", async () => {
    mockGetCurrentUser.mockResolvedValue(user);
    profileRow = { avatar_emoji: "🐧" };

    await createOwnContributorAction(
      {},
      formData({
        displayName: "Casey C.",
        attributionType: "display_name",
        avatarEmoji: "🥝",
      }),
    );

    const insertCall = calls.find((c) => c.method === "insert");
    const payload = insertCall?.args[0] as Record<string, unknown>;
    expect(payload.avatar_emoji).toBe("🐧");
  });

  it("always sets linked_user_id and created_by from the session, never the form", async () => {
    mockGetCurrentUser.mockResolvedValue(user);

    await createOwnContributorAction(
      {},
      formData({
        displayName: "Casey C.",
        attributionType: "display_name",
        // A tampered client could try to claim someone else's identity by
        // supplying these — the action ignores both fields entirely.
        linkedUserId: attacker.id,
        createdBy: attacker.id,
      }),
    );

    const insertCall = calls.find((c) => c.method === "insert");
    const payload = insertCall?.args[0] as Record<string, unknown>;
    expect(payload.linked_user_id).toBe(user.id);
    expect(payload.created_by).toBe(user.id);
  });

  it("surfaces a friendly error when a contributor identity already exists", async () => {
    mockGetCurrentUser.mockResolvedValue(user);
    insertResult = { error: { code: "23505" } };

    const result = await createOwnContributorAction(
      {},
      formData({ displayName: "Casey C.", attributionType: "display_name" }),
    );

    expect(result.error).toMatch(/already have a contributor identity/i);
  });

  // Listed by default (owner decision 2026-11-21): the server derives the
  // directory listing from the page address; the form has no say in it.
  async function insertedStatus(entries: Record<string, string>) {
    mockGetCurrentUser.mockResolvedValue(user);
    const result = await createOwnContributorAction({}, formData(entries));
    const insertCall = calls.find((c) => c.method === "insert");
    const payload = insertCall?.args[0] as Record<string, unknown>;
    return { result, status: payload?.public_status };
  }

  it("lists a contributor with a page address by default", async () => {
    const { result, status } = await insertedStatus({
      displayName: "Casey C.",
      attributionType: "display_name",
      publicSlug: "casey",
    });
    expect(result.error).toBeUndefined();
    expect(status).toBe("public");
  });

  it("never lists an anonymous credit, even with a page address", async () => {
    const { result, status } = await insertedStatus({
      displayName: "Casey C.",
      attributionType: "anonymous",
      publicSlug: "casey",
    });
    expect(result.error).toBeUndefined();
    expect(status).toBe("private");
  });

  it("ignores a posted listing choice", async () => {
    const { status } = await insertedStatus({
      displayName: "Casey C.",
      attributionType: "display_name",
      publicProfileEnabled: "",
      publicSlug: "casey",
    });
    expect(status).toBe("public");
  });
});

describe("createOwnContributorAction page address", () => {
  const inserts = () =>
    calls
      .filter((c) => c.method === "insert")
      .map((c) => c.args[0] as Record<string, unknown>);
  const clashOn = (taken: string[]) => (payload: Record<string, unknown>) =>
    taken.includes(payload.public_slug as string)
      ? {
          error: {
            code: "23505",
            message:
              'duplicate key value violates unique constraint "contributors_public_slug_key"',
          },
        }
      : { error: null };

  it("makes one from the display name and lists the new identity", async () => {
    mockGetCurrentUser.mockResolvedValue(user);
    const result = await createOwnContributorAction(
      {},
      formData({ displayName: "Kaki Ku", attributionType: "display_name" }),
    );
    expect(result.error).toBeUndefined();
    expect(inserts().at(-1)).toMatchObject({
      public_slug: "kaki-ku",
      public_status: "public",
    });
  });

  it("tries the next numbered address when the name is taken", async () => {
    mockGetCurrentUser.mockResolvedValue(user);
    insertResult = clashOn(["kaki-ku", "kaki-ku-2"]);
    const result = await createOwnContributorAction(
      {},
      formData({ displayName: "Kaki Ku", attributionType: "display_name" }),
    );
    expect(result.error).toBeUndefined();
    expect(inserts().map((p) => p.public_slug)).toEqual([
      "kaki-ku",
      "kaki-ku-2",
      "kaki-ku-3",
    ]);
  });

  it("never renames an address the contributor typed", async () => {
    mockGetCurrentUser.mockResolvedValue(user);
    insertResult = clashOn(["mine"]);
    const result = await createOwnContributorAction(
      {},
      formData({
        displayName: "Kaki Ku",
        attributionType: "display_name",
        publicSlug: "mine",
      }),
    );
    expect(result.error).toMatch(/already taken/i);
    expect(inserts()).toHaveLength(1);
  });

  it("gives an anonymous credit no address and keeps it unlisted", async () => {
    mockGetCurrentUser.mockResolvedValue(user);
    await createOwnContributorAction(
      {},
      formData({ displayName: "Kaki Ku", attributionType: "anonymous" }),
    );
    expect(inserts().at(-1)).toMatchObject({
      public_slug: null,
      public_status: "private",
    });
  });

  it("stops at the first error that isn't an address clash", async () => {
    mockGetCurrentUser.mockResolvedValue(user);
    insertResult = { error: { code: "23505", message: "linked_user_id" } };
    const result = await createOwnContributorAction(
      {},
      formData({ displayName: "Kaki Ku", attributionType: "display_name" }),
    );
    expect(result.error).toMatch(/already have a contributor identity/i);
    expect(inserts()).toHaveLength(1);
  });
});

describe("updateOwnContributorAction", () => {
  it("scopes the update to the caller's own linked contributor record", async () => {
    mockGetCurrentUser.mockResolvedValue(user);

    await updateOwnContributorAction(
      {},
      formData({ displayName: "Casey C.", attributionType: "pseudonym" }),
    );

    const eqCall = calls.find((c) => c.method === "eq");
    expect(eqCall?.args).toEqual(["linked_user_id", user.id]);
  });
  // Saving Account must never clear the avatar chosen in Settings.
  it("never writes the avatar, even when a stale form posts one", async () => {
    mockGetCurrentUser.mockResolvedValue(user);

    await updateOwnContributorAction(
      {},
      formData({
        displayName: "Casey C.",
        attributionType: "pseudonym",
        avatarEmoji: "",
      }),
    );

    const updateCall = calls.find((c) => c.method === "update");
    expect(updateCall?.args[0]).not.toHaveProperty("avatar_emoji");
  });
});
