import { describe, expect, it, vi, beforeEach } from "vitest";

const mockGetCurrentUser = vi.fn();
vi.mock("@/lib/auth/get-current-user", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

const mockRevalidatePath = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}));

// Records every call through the chainable query-builder mock so each test
// can assert exactly which table/row was targeted and what was written --
// the ownership guarantee itself lives in RLS, so what matters here is that
// no client-supplied owner ever reaches the query.
const calls: { method: string; args: unknown[] }[] = [];
let writeResult: {
  data: Array<{ id: string }> | null;
  error: { message: string } | null;
} = { data: [{ id: "row" }], error: null };

function chain() {
  const builder = {
    update: (...args: unknown[]) => {
      calls.push({ method: "update", args });
      return builder;
    },
    delete: (...args: unknown[]) => {
      calls.push({ method: "delete", args });
      return builder;
    },
    eq: (...args: unknown[]) => {
      calls.push({ method: "eq", args });
      return builder;
    },
    select: (...args: unknown[]) => {
      calls.push({ method: "select", args });
      return Promise.resolve(writeResult);
    },
  };
  return builder;
}

const mockFrom = vi.fn((table: string) => {
  calls.push({ method: "from", args: [table] });
  return chain();
});
const mockRpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: mockFrom, rpc: mockRpc }),
}));

import {
  createAffirmationLinkAction,
  deleteAffirmationLinkAction,
  deleteAffirmationNoteAction,
  renameAffirmationLinkAction,
  setAffirmationLinkActiveAction,
} from "./actions";

const user = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
const attackerId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const linkId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const noteId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function formData(entries: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) fd.set(key, value);
  return fd;
}

beforeEach(() => {
  calls.length = 0;
  writeResult = { data: [{ id: "row" }], error: null };
  mockFrom.mockClear();
  mockRpc.mockReset();
  mockRpc.mockResolvedValue({ data: [], error: null });
  mockRevalidatePath.mockReset();
  mockGetCurrentUser.mockReset();
  mockGetCurrentUser.mockResolvedValue(user);
});

describe("createAffirmationLinkAction", () => {
  it("calls the RPC with only a label -- never an owner or token", async () => {
    const result = await createAffirmationLinkAction(
      {},
      formData({
        label: "  Family chat ",
        // Smuggled fields a tampered client might post.
        owner_id: attackerId,
        ownerId: attackerId,
        token: "f".repeat(64),
      }),
    );

    expect(result.error).toBeUndefined();
    expect(result.savedAt).toBeTruthy();
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith("create_affirmation_link", {
      p_label: "Family chat",
    });
    expect(JSON.stringify(mockRpc.mock.calls)).not.toContain(attackerId);
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockRevalidatePath).toHaveBeenCalledWith("/affirmations");
  });

  it("omits the label arg (database default null) for a blank label", async () => {
    await createAffirmationLinkAction({}, formData({ label: "   " }));
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc.mock.calls[0][1].p_label).toBeUndefined();
  });

  it("reports the link cap clearly", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "affirmation_link_limit" },
    });
    const result = await createAffirmationLinkAction({}, formData({}));
    expect(result.error).toMatch(/up to 20 links/);
    expect(result.savedAt).toBeUndefined();
  });

  it("gives a generic failure for any other RPC error", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "boom: secret" },
    });
    const result = await createAffirmationLinkAction({}, formData({}));
    expect(result.error).toBe(
      "We couldn't create that link. Please try again.",
    );
    expect(result.error).not.toContain("secret");
  });

  it("rejects a too-long label before calling the database", async () => {
    const result = await createAffirmationLinkAction(
      {},
      formData({ label: "x".repeat(81) }),
    );
    expect(result.error).toBeTruthy();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("rejects a signed-out caller", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const result = await createAffirmationLinkAction({}, formData({}));
    expect(result.error).toBe("You must be signed in.");
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe("renameAffirmationLinkAction", () => {
  it("updates only the label of the named link, with no owner filter from the client", async () => {
    const result = await renameAffirmationLinkAction(
      {},
      formData({ linkId, label: " Travel mates ", owner_id: attackerId }),
    );

    expect(result.error).toBeUndefined();
    expect(calls).toEqual([
      { method: "from", args: ["affirmation_links"] },
      { method: "update", args: [{ label: "Travel mates" }] },
      { method: "eq", args: ["id", linkId] },
      { method: "select", args: ["id"] },
    ]);
    expect(JSON.stringify(calls)).not.toContain(attackerId);
  });

  it("clears the label when blank", async () => {
    await renameAffirmationLinkAction({}, formData({ linkId, label: "" }));
    expect(calls.find((c) => c.method === "update")?.args).toEqual([
      { label: null },
    ]);
  });

  it("fails when RLS matched no row (someone else's link)", async () => {
    writeResult = { data: [], error: null };
    const result = await renameAffirmationLinkAction(
      {},
      formData({ linkId, label: "x" }),
    );
    expect(result.error).toBeTruthy();
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("rejects a non-uuid id and a signed-out caller", async () => {
    expect(
      (await renameAffirmationLinkAction({}, formData({ linkId: "1; drop" })))
        .error,
    ).toBeTruthy();
    expect(mockFrom).not.toHaveBeenCalled();

    mockGetCurrentUser.mockResolvedValue(null);
    expect(
      (await renameAffirmationLinkAction({}, formData({ linkId }))).error,
    ).toBe("You must be signed in.");
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe("setAffirmationLinkActiveAction", () => {
  it("writes only is_active", async () => {
    const result = await setAffirmationLinkActiveAction(linkId, false);
    expect(result).toEqual({ ok: true });
    expect(calls.find((c) => c.method === "update")?.args).toEqual([
      { is_active: false },
    ]);
    expect(calls.find((c) => c.method === "eq")?.args).toEqual(["id", linkId]);
  });

  it("reports failure when nothing matched or the write errored", async () => {
    writeResult = { data: [], error: null };
    expect((await setAffirmationLinkActiveAction(linkId, true)).ok).toBe(false);
    writeResult = { data: null, error: { message: "x" } };
    expect((await setAffirmationLinkActiveAction(linkId, true)).ok).toBe(false);
  });

  it("rejects a bad id and a signed-out caller without touching the database", async () => {
    expect((await setAffirmationLinkActiveAction("nope", true)).ok).toBe(false);
    mockGetCurrentUser.mockResolvedValue(null);
    expect((await setAffirmationLinkActiveAction(linkId, true)).ok).toBe(false);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe("deleteAffirmationLinkAction", () => {
  it("deletes the named link only", async () => {
    const result = await deleteAffirmationLinkAction(linkId);
    expect(result).toEqual({ ok: true });
    expect(calls.map((c) => c.method)).toEqual([
      "from",
      "delete",
      "eq",
      "select",
    ]);
    expect(calls[0].args).toEqual(["affirmation_links"]);
    expect(calls[2].args).toEqual(["id", linkId]);
    expect(mockRevalidatePath).toHaveBeenCalledWith("/affirmations");
  });

  it("fails when RLS matched no row", async () => {
    writeResult = { data: [], error: null };
    expect((await deleteAffirmationLinkAction(linkId)).ok).toBe(false);
  });

  it("rejects a bad id and a signed-out caller", async () => {
    expect((await deleteAffirmationLinkAction("nope")).ok).toBe(false);
    mockGetCurrentUser.mockResolvedValue(null);
    expect((await deleteAffirmationLinkAction(linkId)).ok).toBe(false);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe("deleteAffirmationNoteAction", () => {
  it("deletes the named note from the notes table", async () => {
    const result = await deleteAffirmationNoteAction(noteId);
    expect(result).toEqual({ ok: true });
    expect(calls[0].args).toEqual(["affirmation_notes"]);
    expect(calls.find((c) => c.method === "eq")?.args).toEqual(["id", noteId]);
  });

  it("fails when RLS matched no row (not the link owner)", async () => {
    writeResult = { data: [], error: null };
    expect((await deleteAffirmationNoteAction(noteId)).ok).toBe(false);
  });

  it("rejects a bad id and a signed-out caller", async () => {
    expect((await deleteAffirmationNoteAction("nope")).ok).toBe(false);
    mockGetCurrentUser.mockResolvedValue(null);
    expect((await deleteAffirmationNoteAction(noteId)).ok).toBe(false);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
