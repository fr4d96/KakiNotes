import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePath = vi.fn();
const revalidateTag = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (p: string) => revalidatePath(p),
  revalidateTag: (tag: string, profile: unknown) => revalidateTag(tag, profile),
}));
const dangerouslyDeleteByTag = vi.fn<(tag: string) => Promise<void>>(
  async () => {},
);
vi.mock("@vercel/functions", () => ({
  dangerouslyDeleteByTag: (tag: string) => dangerouslyDeleteByTag(tag),
  waitUntil: () => {},
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/story/public-queries", () => ({
  PUBLIC_STORIES_TAG: "public-stories",
  PUBLIC_CONTRIBUTORS_TAG: "public-contributors",
}));
vi.mock("@/lib/auth/get-current-user", () => ({
  getCurrentUser: async () => ({ id: "mod-1" }),
}));
vi.mock("@/lib/auth/roles", () => ({
  getCurrentUserRole: async () => "moderator",
}));
const decide = vi.fn();
vi.mock("@/lib/story/moderation", () => ({
  decideStoryTakedown: (...args: unknown[]) => decide(...args),
}));
vi.mock("@/lib/log", () => ({ logAppEvent: () => {} }));

import { decideTakedownAction } from "./actions";

const REQUEST_ID = "3f0c2a52-6a57-4a0c-9c53-1d1c3c1f2b11";

beforeEach(() => {
  vi.clearAllMocks();
  decide.mockResolvedValue(undefined);
});

// Deliberately NOT mocking lib/story/public-cache: the point is that a
// takedown really empties the photo cache (Engineering Rule 12), however the
// helpers behind it are arranged.
describe("decideTakedownAction and the public photo cache", () => {
  it.each([
    ["with a slug", "a-year-in-otago"],
    ["without a slug", null],
  ])("hard-purges every cached photo on approval %s", async (_label, slug) => {
    const result = await decideTakedownAction(REQUEST_ID, true, slug);
    expect(result).toEqual({ ok: true });
    expect(revalidateTag).toHaveBeenCalledWith("public-media", { expire: 0 });
    expect(dangerouslyDeleteByTag).toHaveBeenCalledWith("public-media");
  });

  it("purges nothing when the takedown is declined", async () => {
    await decideTakedownAction(REQUEST_ID, false, "s", "Not this time");
    expect(dangerouslyDeleteByTag).not.toHaveBeenCalled();
  });

  it("purges nothing when the decision itself fails", async () => {
    decide.mockRejectedValueOnce(new Error("already been decided"));
    const result = await decideTakedownAction(REQUEST_ID, true, "s");
    expect(result.ok).toBe(false);
    expect(dangerouslyDeleteByTag).not.toHaveBeenCalled();
  });
});
