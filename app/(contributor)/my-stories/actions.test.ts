import { describe, expect, it, vi, beforeEach } from "vitest";

// Follows app/(contributor)/actions.test.ts's established pattern: mock the
// side-effecting server dependencies at the module boundary and test the
// action's DECISION logic as a pure unit, rather than rendering a Server
// Action against a live Supabase instance.

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const mockGetCurrentUser = vi.fn();
vi.mock("@/lib/auth/get-current-user", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

const mockDeleteDraftStory = vi.fn();
const mockRequestStoryTakedown = vi.fn();
const mockCancelStoryTakedownRequest = vi.fn();
const mockSetStoryParentStory = vi.fn();
vi.mock("@/lib/story/mutations", () => ({
  deleteDraftStory: (...args: unknown[]) => mockDeleteDraftStory(...args),
  requestStoryTakedown: (...args: unknown[]) =>
    mockRequestStoryTakedown(...args),
  cancelStoryTakedownRequest: (...args: unknown[]) =>
    mockCancelStoryTakedownRequest(...args),
  setStoryParentStory: (...args: unknown[]) => mockSetStoryParentStory(...args),
}));

const mockListMyStories = vi.fn();
vi.mock("@/lib/story/contributor-queries", () => ({
  listMyStories: () => mockListMyStories(),
}));

const mockGetStoryParentStory = vi.fn();
const mockListParentStoryOptions = vi.fn();
vi.mock("@/lib/story/sub-stories", () => ({
  getStoryParentStory: (...args: unknown[]) => mockGetStoryParentStory(...args),
  listParentStoryOptions: (...args: unknown[]) =>
    mockListParentStoryOptions(...args),
}));

vi.mock("@/lib/log", () => ({ logAppEvent: vi.fn() }));

const user = { id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" };

import { revalidatePath } from "next/cache";
import {
  deleteDraftStoryAction,
  loadLinkMainStoryDataAction,
  linkMainStoryAction,
} from "./actions";

const mockRevalidatePath = vi.mocked(revalidatePath);

beforeEach(() => {
  mockRevalidatePath.mockClear();
  mockDeleteDraftStory.mockReset();
  mockGetCurrentUser.mockReset();
  mockGetStoryParentStory.mockReset();
  mockListParentStoryOptions.mockReset();
  mockSetStoryParentStory.mockReset();
});

describe("deleteDraftStoryAction", () => {
  // BUG: My Stories kept showing a just-deleted draft after confirming the
  // delete. delete_draft_story() itself succeeds (mockDeleteDraftStory
  // resolves) -- the gap is that this action never invalidates the
  // "/my-stories" route the way requestStoryTakedownAction and
  // cancelStoryTakedownAction both do a few lines below it in actions.ts.
  // The client's router.refresh() only asks Next to re-render the current
  // route; it does not, by itself, guarantee a server-rendered list that
  // was cached under that path gets rebuilt, so the deleted story could
  // still be served back to the same page. Every other mutating action in
  // this file calls revalidatePath("/my-stories") on success -- this one
  // should too.
  it("revalidates /my-stories after a successful delete", async () => {
    mockGetCurrentUser.mockResolvedValue(user);
    mockDeleteDraftStory.mockResolvedValue(undefined);

    const result = await deleteDraftStoryAction("story-1", 1);

    expect(result.ok).toBe(true);
    expect(mockDeleteDraftStory).toHaveBeenCalledWith("story-1", 1);
    expect(mockRevalidatePath).toHaveBeenCalledWith("/my-stories");
  });

  it("does not revalidate when the delete itself fails", async () => {
    mockGetCurrentUser.mockResolvedValue(user);
    mockDeleteDraftStory.mockRejectedValue(new Error("nope"));

    const result = await deleteDraftStoryAction("story-1", 1);

    expect(result.ok).toBe(false);
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("rejects when there is no authenticated user, without touching the RPC", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const result = await deleteDraftStoryAction("story-1", 1);

    expect(result.ok).toBe(false);
    expect(mockDeleteDraftStory).not.toHaveBeenCalled();
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });
});

const STORY_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const PARENT_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

describe("loadLinkMainStoryDataAction", () => {
  it("rejects a non-uuid storyId without calling any reader", async () => {
    mockGetCurrentUser.mockResolvedValue(user);

    const result = await loadLinkMainStoryDataAction("not-a-uuid");

    expect(result.ok).toBe(false);
    expect(mockGetStoryParentStory).not.toHaveBeenCalled();
    expect(mockListParentStoryOptions).not.toHaveBeenCalled();
  });

  it("rejects when there is no authenticated user, without touching any reader", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const result = await loadLinkMainStoryDataAction(STORY_ID);

    expect(result.ok).toBe(false);
    expect(mockGetStoryParentStory).not.toHaveBeenCalled();
  });

  it("returns the current main story, the sub-story flag and the options", async () => {
    mockGetCurrentUser.mockResolvedValue(user);
    mockGetStoryParentStory.mockResolvedValue({
      parent: { storyId: PARENT_ID, title: "Food in Queenstown", slug: "food" },
      hasSubStories: false,
    });
    mockListParentStoryOptions.mockResolvedValue([
      { storyId: PARENT_ID, title: "Food in Queenstown", slug: "food" },
    ]);

    const result = await loadLinkMainStoryDataAction(STORY_ID);

    expect(mockGetStoryParentStory).toHaveBeenCalledWith(STORY_ID);
    expect(mockListParentStoryOptions).toHaveBeenCalledWith(STORY_ID);
    expect(result).toEqual({
      ok: true,
      data: {
        parent: {
          storyId: PARENT_ID,
          title: "Food in Queenstown",
          slug: "food",
        },
        hasSubStories: false,
        options: [
          { storyId: PARENT_ID, title: "Food in Queenstown", slug: "food" },
        ],
      },
    });
  });

  it("gives one generic failure when the owner-only RPC refuses, so it can't be used to probe", async () => {
    mockGetCurrentUser.mockResolvedValue(user);
    mockGetStoryParentStory.mockRejectedValue(
      new Error("Only the story owner can read its main story"),
    );
    mockListParentStoryOptions.mockResolvedValue([]);

    const result = await loadLinkMainStoryDataAction(STORY_ID);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).not.toMatch(/owner/i);
  });
});

describe("linkMainStoryAction", () => {
  it("links through setStoryParentStory with the validated ids", async () => {
    mockGetCurrentUser.mockResolvedValue(user);
    mockSetStoryParentStory.mockResolvedValue(undefined);

    const result = await linkMainStoryAction(STORY_ID, PARENT_ID);

    expect(result).toEqual({ ok: true });
    expect(mockSetStoryParentStory).toHaveBeenCalledWith(STORY_ID, PARENT_ID);
  });

  it("passes null through to clear the link", async () => {
    mockGetCurrentUser.mockResolvedValue(user);
    mockSetStoryParentStory.mockResolvedValue(undefined);

    const result = await linkMainStoryAction(STORY_ID, null);

    expect(result).toEqual({ ok: true });
    expect(mockSetStoryParentStory).toHaveBeenCalledWith(STORY_ID, null);
  });

  it.each([
    ["a non-uuid story", "nope", PARENT_ID],
    ["a non-uuid main story", STORY_ID, "nope"],
    ["a missing main story argument", STORY_ID, undefined],
  ])("rejects %s without calling the mutation", async (_, story, parent) => {
    mockGetCurrentUser.mockResolvedValue(user);

    const result = await linkMainStoryAction(story, parent);

    expect(result.ok).toBe(false);
    expect(mockSetStoryParentStory).not.toHaveBeenCalled();
  });

  it("rejects when signed out, without calling the mutation", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const result = await linkMainStoryAction(STORY_ID, PARENT_ID);

    expect(result.ok).toBe(false);
    expect(mockSetStoryParentStory).not.toHaveBeenCalled();
  });

  it("maps a WHV15 refusal (story not published) to its translated message", async () => {
    mockGetCurrentUser.mockResolvedValue(user);
    mockSetStoryParentStory.mockRejectedValue({ code: "WHV15", message: "x" });

    const result = await linkMainStoryAction(STORY_ID, PARENT_ID);

    expect(result).toEqual({
      ok: false,
      error: "Only published stories can be linked.",
    });
  });
});
