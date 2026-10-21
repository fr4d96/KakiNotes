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
vi.mock("@/lib/story/mutations", () => ({
  deleteDraftStory: (...args: unknown[]) => mockDeleteDraftStory(...args),
  requestStoryTakedown: (...args: unknown[]) =>
    mockRequestStoryTakedown(...args),
  cancelStoryTakedownRequest: (...args: unknown[]) =>
    mockCancelStoryTakedownRequest(...args),
}));

const mockListMyStories = vi.fn();
vi.mock("@/lib/story/contributor-queries", () => ({
  listMyStories: () => mockListMyStories(),
}));

vi.mock("@/lib/log", () => ({ logAppEvent: vi.fn() }));

const user = { id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" };

import { revalidatePath } from "next/cache";
import { deleteDraftStoryAction } from "./actions";

const mockRevalidatePath = vi.mocked(revalidatePath);

beforeEach(() => {
  mockRevalidatePath.mockClear();
  mockDeleteDraftStory.mockReset();
  mockGetCurrentUser.mockReset();
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
