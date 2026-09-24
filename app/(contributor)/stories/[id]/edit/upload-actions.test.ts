import { describe, expect, it, vi, beforeEach } from "vitest";

// Follows app/(contributor)/actions.test.ts and app/(moderation)/moderation/
// stories/[id]/actions.test.ts's established pattern: mock the
// side-effecting server dependencies at the module boundary and test the
// action's DECISION logic (retry-once-on-stale-version, when cancel fires)
// as a pure unit, never against a live Supabase instance.
//
// "server-only" throws unconditionally outside a react-server bundling
// condition (confirmed by reading node_modules/server-only/index.js) --
// upload-actions.ts pulls it in transitively via lib/story/image-pipeline.ts
// and lib/story/heic.ts, so both are mocked at the module boundary rather
// than imported for real (same reason the moderation actions test mocks
// image-pipeline instead of importing it).
vi.mock("server-only", () => ({}));

const mockGetCurrentUser = vi.fn();
vi.mock("@/lib/auth/get-current-user", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

const mockFinalizeStoryMediaUpload = vi.fn();
const mockCancelPendingStoryMediaUpload = vi.fn();
const mockStoryVersionForMedia = vi.fn();
vi.mock("@/lib/story/mutations", () => ({
  authorizeHeicTranscode: vi.fn(),
  beginStoryMediaUpload: vi.fn(),
  finalizeStoryMediaUpload: (...args: unknown[]) =>
    mockFinalizeStoryMediaUpload(...args),
  recordHeicTranscodedOriginal: vi.fn(),
  storyVersionForMedia: (...args: unknown[]) =>
    mockStoryVersionForMedia(...args),
  cancelPendingStoryMediaUpload: (...args: unknown[]) =>
    mockCancelPendingStoryMediaUpload(...args),
}));

// isStaleVersionConflict is real, pure regex logic (lib/story/mutation-
// queue.ts) -- not mocked, so the "is this actually a stale-version error"
// decision under test is the genuine one, not a stand-in.
vi.mock("@/lib/story/image-pipeline", () => ({
  processStoryMedia: vi.fn(),
  transcodeStagedHeicUpload: vi.fn(),
}));
vi.mock("@/lib/story/heic", () => ({
  HeicTranscodeError: class HeicTranscodeError extends Error {},
}));

import { finalizeMediaUploadAction } from "./upload-actions";

const user = { id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" };
const mediaId = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  mockGetCurrentUser.mockReset();
  mockGetCurrentUser.mockResolvedValue(user);
  mockFinalizeStoryMediaUpload.mockReset();
  mockCancelPendingStoryMediaUpload.mockReset();
  mockCancelPendingStoryMediaUpload.mockResolvedValue(undefined);
  mockStoryVersionForMedia.mockReset();
});

describe("finalizeMediaUploadAction", () => {
  it("happy path: succeeds first time, no retry, no cancel, returns the read-back version", async () => {
    mockFinalizeStoryMediaUpload.mockResolvedValueOnce(undefined);
    mockStoryVersionForMedia.mockResolvedValueOnce(8);

    const result = await finalizeMediaUploadAction(mediaId, 7);

    expect(mockFinalizeStoryMediaUpload).toHaveBeenCalledTimes(1);
    expect(mockFinalizeStoryMediaUpload).toHaveBeenCalledWith(mediaId, 7);
    expect(mockCancelPendingStoryMediaUpload).not.toHaveBeenCalled();
    expect(result).toEqual({ mediaId, version: 8 });
  });

  it("retries once on a stale-version error and does not cancel when the retry succeeds", async () => {
    mockFinalizeStoryMediaUpload
      .mockRejectedValueOnce(
        new Error("Stale version for story abc (expected 7, got 5)"),
      )
      .mockResolvedValueOnce(undefined);
    mockStoryVersionForMedia
      // First read: the recovery lookup after the stale-version rejection.
      .mockResolvedValueOnce(5)
      // Second read: the final version read before returning.
      .mockResolvedValueOnce(5);

    const result = await finalizeMediaUploadAction(mediaId, 7);

    expect(mockCancelPendingStoryMediaUpload).not.toHaveBeenCalled();
    expect(mockFinalizeStoryMediaUpload).toHaveBeenCalledTimes(2);
    expect(mockFinalizeStoryMediaUpload).toHaveBeenNthCalledWith(1, mediaId, 7);
    // The retry uses the version storyVersionForMedia returned, not a
    // guessed expectedVersion + 1.
    expect(mockFinalizeStoryMediaUpload).toHaveBeenNthCalledWith(2, mediaId, 5);
    expect(result).toEqual({ mediaId, version: 5 });
  });

  it("cancels and returns an error when the stale-version retry also fails", async () => {
    mockFinalizeStoryMediaUpload
      .mockRejectedValueOnce(new Error("Stale version for story abc"))
      .mockRejectedValueOnce(new Error("Stale version for story abc, again"));
    mockStoryVersionForMedia.mockResolvedValueOnce(5);

    const result = await finalizeMediaUploadAction(mediaId, 7);

    expect(mockFinalizeStoryMediaUpload).toHaveBeenCalledTimes(2);
    expect(mockCancelPendingStoryMediaUpload).toHaveBeenCalledWith(mediaId);
    expect(result).toEqual({ error: expect.any(String) });
    expect("error" in result && result.error).toBeTruthy();
  });

  it("does not retry a non-stale error, and cancels", async () => {
    mockFinalizeStoryMediaUpload.mockRejectedValueOnce(
      new Error("Upload not found for media x"),
    );

    const result = await finalizeMediaUploadAction(mediaId, 7);

    expect(mockFinalizeStoryMediaUpload).toHaveBeenCalledTimes(1);
    expect(mockStoryVersionForMedia).not.toHaveBeenCalled();
    expect(mockCancelPendingStoryMediaUpload).toHaveBeenCalledWith(mediaId);
    expect("error" in result && result.error).toBeTruthy();
  });

  it("does not retry when storyVersionForMedia returns null on a stale error, and cancels", async () => {
    mockFinalizeStoryMediaUpload.mockRejectedValueOnce(
      new Error("Stale version for story abc"),
    );
    mockStoryVersionForMedia.mockResolvedValueOnce(null);

    const result = await finalizeMediaUploadAction(mediaId, 7);

    expect(mockFinalizeStoryMediaUpload).toHaveBeenCalledTimes(1);
    expect(mockCancelPendingStoryMediaUpload).toHaveBeenCalledWith(mediaId);
    expect("error" in result && result.error).toBeTruthy();
  });
});
