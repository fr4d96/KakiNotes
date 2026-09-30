import { describe, expect, it, vi, beforeEach } from "vitest";

// Same approach as upload-actions.test.ts: mock the side-effecting
// dependencies at the module boundary, test the action's decisions.
vi.mock("server-only", () => ({}));

const mockGetCurrentUser = vi.fn();
vi.mock("@/lib/auth/get-current-user", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

const mockSetRevisionParentStory = vi.fn();
vi.mock("@/lib/story/mutations", () => ({
  saveRevisionDraft: vi.fn(),
  setRevisionLocations: vi.fn(),
  setRevisionTags: vi.fn(),
  setRevisionExpenses: vi.fn(),
  setRevisionParentStory: (...args: unknown[]) =>
    mockSetRevisionParentStory(...args),
  updateStoryMediaCaption: vi.fn(),
  reorderStoryMedia: vi.fn(),
  setStoryCoverMedia: vi.fn(),
  detachStoryMedia: vi.fn(),
  cancelPendingStoryMediaUpload: vi.fn(),
}));

import en from "@/i18n/messages/en.json";
import { setParentStoryAction } from "./actions";

const REVISION = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PARENT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

beforeEach(() => {
  mockSetRevisionParentStory.mockReset();
  mockGetCurrentUser.mockReset();
  mockGetCurrentUser.mockResolvedValue({
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  });
});

describe("setParentStoryAction", () => {
  it("rejects a non-uuid without calling the mutation", async () => {
    const result = await setParentStoryAction(REVISION, 3, "not-a-uuid");
    expect(result.ok).toBe(false);
    expect(mockSetRevisionParentStory).not.toHaveBeenCalled();
  });

  it("passes a valid uuid through", async () => {
    mockSetRevisionParentStory.mockResolvedValue(undefined);
    const result = await setParentStoryAction(REVISION, 3, PARENT);
    expect(result).toEqual({ ok: true });
    expect(mockSetRevisionParentStory).toHaveBeenCalledWith(
      REVISION,
      3,
      PARENT,
    );
  });

  it("passes null through to clear the main story", async () => {
    mockSetRevisionParentStory.mockResolvedValue(undefined);
    const result = await setParentStoryAction(REVISION, 3, null);
    expect(result).toEqual({ ok: true });
    expect(mockSetRevisionParentStory).toHaveBeenCalledWith(REVISION, 3, null);
  });

  it("maps a WHV12 refusal to the translated message", async () => {
    mockSetRevisionParentStory.mockRejectedValue({ code: "WHV12" });
    const result = await setParentStoryAction(REVISION, 3, PARENT);
    expect(result).toEqual({
      ok: false,
      error: en.actionErrors.subStoryParentNotPublished,
    });
  });
});
