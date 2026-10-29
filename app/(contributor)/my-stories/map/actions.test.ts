import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const mockGetCurrentUser = vi.fn();
vi.mock("@/lib/auth/get-current-user", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

const mockSetStoryParent = vi.fn();
vi.mock("@/lib/story/mutations", () => ({
  setStoryParent: (...args: unknown[]) => mockSetStoryParent(...args),
}));

const mockListMyStories = vi.fn();
vi.mock("@/lib/story/contributor-queries", () => ({
  listMyStories: () => mockListMyStories(),
}));

const mockInvalidateStoryPublicCache = vi.fn();
const mockInvalidateStoryListingsPublicCache = vi.fn();
vi.mock("@/lib/story/public-cache", () => ({
  invalidateStoryPublicCache: (...args: unknown[]) =>
    mockInvalidateStoryPublicCache(...args),
  invalidateStoryListingsPublicCache: () =>
    mockInvalidateStoryListingsPublicCache(),
}));

vi.mock("@/lib/log", () => ({ logAppEvent: vi.fn() }));

const user = { id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" };
const STORY_A = "11111111-1111-4111-8111-111111111111";
const STORY_B = "22222222-2222-4222-8222-222222222222";
const STORY_C = "33333333-3333-4333-8333-333333333333";

import { setStoryParentAction } from "./actions";

beforeEach(() => {
  mockGetCurrentUser.mockReset();
  mockSetStoryParent.mockReset();
  mockListMyStories.mockReset();
  mockInvalidateStoryPublicCache.mockReset();
  mockInvalidateStoryListingsPublicCache.mockReset();
  mockListMyStories.mockResolvedValue([
    { id: STORY_A, slug: "story-a" },
    { id: STORY_B, slug: "story-b" },
    { id: STORY_C, slug: "story-c" },
  ]);
});

describe("setStoryParentAction", () => {
  it("files a story under a folder and invalidates both pages", async () => {
    mockGetCurrentUser.mockResolvedValue(user);
    mockSetStoryParent.mockResolvedValue(undefined);

    const result = await setStoryParentAction(STORY_A, STORY_B);

    expect(result).toEqual({ ok: true });
    expect(mockSetStoryParent).toHaveBeenCalledWith(STORY_A, STORY_B);
    expect(mockInvalidateStoryPublicCache).toHaveBeenCalledWith("story-a");
    expect(mockInvalidateStoryPublicCache).toHaveBeenCalledWith("story-b");
  });

  it("removes a story from its folder with a null parentId", async () => {
    mockGetCurrentUser.mockResolvedValue(user);
    mockSetStoryParent.mockResolvedValue(undefined);

    const result = await setStoryParentAction(STORY_A, null);

    expect(result).toEqual({ ok: true });
    expect(mockSetStoryParent).toHaveBeenCalledWith(STORY_A, null);
    expect(mockInvalidateStoryPublicCache).toHaveBeenCalledWith("story-a");
  });

  it("also invalidates the story's OLD parent page when re-filing", async () => {
    mockGetCurrentUser.mockResolvedValue(user);
    mockSetStoryParent.mockResolvedValue(undefined);

    await setStoryParentAction(STORY_A, STORY_B, STORY_C);

    expect(mockInvalidateStoryPublicCache).toHaveBeenCalledWith("story-a");
    expect(mockInvalidateStoryPublicCache).toHaveBeenCalledWith("story-b");
    expect(mockInvalidateStoryPublicCache).toHaveBeenCalledWith("story-c");
  });

  it.each([
    ["a non-uuid story", "nope", STORY_B],
    ["a non-uuid parent id", STORY_A, "nope"],
  ])("rejects %s without calling the mutation", async (_, story, parent) => {
    mockGetCurrentUser.mockResolvedValue(user);

    const result = await setStoryParentAction(story, parent);

    expect(result.ok).toBe(false);
    expect(mockSetStoryParent).not.toHaveBeenCalled();
  });

  it("rejects when signed out, without calling the mutation", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const result = await setStoryParentAction(STORY_A, STORY_B);

    expect(result.ok).toBe(false);
    expect(mockSetStoryParent).not.toHaveBeenCalled();
  });

  it("maps a WHV14 refusal (already has sub stories) to its translated message", async () => {
    mockGetCurrentUser.mockResolvedValue(user);
    mockSetStoryParent.mockRejectedValue({ code: "WHV14", message: "x" });

    const result = await setStoryParentAction(STORY_A, STORY_B);

    expect(result).toEqual({
      ok: false,
      error:
        "This story already has sub stories, so it can't be filed into a folder.",
    });
    expect(mockInvalidateStoryPublicCache).not.toHaveBeenCalled();
  });

  it("maps a WHV10 self-filing refusal to its translated message", async () => {
    mockGetCurrentUser.mockResolvedValue(user);
    mockSetStoryParent.mockRejectedValue({ code: "WHV10", message: "x" });

    const result = await setStoryParentAction(STORY_A, STORY_A);

    expect(result).toEqual({
      ok: false,
      error: "A story can't be filed under itself.",
    });
  });

  it("falls back to the listings-only cache invalidation when a slug can't be resolved", async () => {
    mockGetCurrentUser.mockResolvedValue(user);
    mockSetStoryParent.mockResolvedValue(undefined);
    mockListMyStories.mockResolvedValue([{ id: STORY_A, slug: "story-a" }]);

    await setStoryParentAction(STORY_A, STORY_B);

    expect(mockInvalidateStoryPublicCache).toHaveBeenCalledWith("story-a");
    expect(mockInvalidateStoryListingsPublicCache).toHaveBeenCalled();
  });
});
