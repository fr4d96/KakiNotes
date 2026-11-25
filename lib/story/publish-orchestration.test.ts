import { describe, expect, it, vi } from "vitest";
import { runApproveOrchestration } from "./publish-orchestration";
import type { ModeratorMediaItem } from "./moderation";

function media(
  overrides: Partial<ModeratorMediaItem> & { mediaId: string },
): ModeratorMediaItem {
  return {
    sortOrder: 0,
    isCover: false,
    altText: null,
    caption: null,
    decorative: false,
    processingState: "processed",
    ...overrides,
  };
}

describe("runApproveOrchestration", () => {
  it("skips already-promoted media and finalizes on full success", async () => {
    const beginAttempt = vi.fn().mockResolvedValue("attempt-1");
    const copyMedia = vi.fn().mockResolvedValue(undefined);
    const finalize = vi.fn().mockResolvedValue(undefined);

    const result = await runApproveOrchestration(
      {
        revisionId: "rev-1",
        media: [
          media({ mediaId: "m-promoted", processingState: "promoted" }),
          media({ mediaId: "m-processed", processingState: "processed" }),
        ],
      },
      { beginAttempt, copyMedia, finalize },
    );

    expect(result).toEqual({ ok: true, approvalAttemptId: "attempt-1" });
    expect(copyMedia).toHaveBeenCalledTimes(1);
    expect(copyMedia).toHaveBeenCalledWith("m-processed", "attempt-1");
    expect(finalize).toHaveBeenCalledWith({
      revisionId: "rev-1",
      approvalAttemptId: "attempt-1",
      userFacingReason: undefined,
      editorNote: undefined,
    });
  });

  it("never calls copyMedia or finalize when begin fails", async () => {
    const beginAttempt = vi
      .fn()
      .mockRejectedValue(new Error("already has an active attempt"));
    const copyMedia = vi.fn();
    const finalize = vi.fn();

    const result = await runApproveOrchestration(
      { revisionId: "rev-1", media: [] },
      { beginAttempt, copyMedia, finalize },
    );

    expect(result).toEqual({
      ok: false,
      stage: "begin",
      error: "already has an active attempt",
    });
    expect(copyMedia).not.toHaveBeenCalled();
    expect(finalize).not.toHaveBeenCalled();
  });

  it("stops at the first media-copy failure, leaves the attempt active, and never calls finalize", async () => {
    const beginAttempt = vi.fn().mockResolvedValue("attempt-2");
    const copyMedia = vi
      .fn()
      .mockResolvedValueOnce(undefined) // m-1 succeeds
      .mockRejectedValueOnce(new Error("byte verification failed")); // m-2 fails
    const finalize = vi.fn();

    const result = await runApproveOrchestration(
      {
        revisionId: "rev-1",
        media: [
          media({ mediaId: "m-1", processingState: "processed" }),
          media({ mediaId: "m-2", processingState: "processed" }),
          media({ mediaId: "m-3", processingState: "processed" }),
        ],
      },
      { beginAttempt, copyMedia, finalize },
    );

    expect(result).toEqual({
      ok: false,
      stage: "copy_media",
      error: "byte verification failed",
      mediaId: "m-2",
      approvalAttemptId: "attempt-2",
    });
    // m-3 is never attempted once m-2 fails.
    expect(copyMedia).toHaveBeenCalledTimes(2);
    expect(finalize).not.toHaveBeenCalled();
  });

  it("reports a finalize failure with the attempt id still surfaced, for a safe retry", async () => {
    const beginAttempt = vi.fn().mockResolvedValue("attempt-3");
    const copyMedia = vi.fn().mockResolvedValue(undefined);
    const finalize = vi
      .fn()
      .mockRejectedValue(new Error("no currently-valid consent grant"));

    const result = await runApproveOrchestration(
      {
        revisionId: "rev-1",
        media: [media({ mediaId: "m-1", processingState: "processed" })],
      },
      { beginAttempt, copyMedia, finalize },
    );

    expect(result).toEqual({
      ok: false,
      stage: "finalize",
      error: "no currently-valid consent grant",
      approvalAttemptId: "attempt-3",
    });
  });

  it("retries a promotion_pending item (does not treat it as already done)", async () => {
    const beginAttempt = vi.fn().mockResolvedValue("attempt-4");
    const copyMedia = vi.fn().mockResolvedValue(undefined);
    const finalize = vi.fn().mockResolvedValue(undefined);

    const result = await runApproveOrchestration(
      {
        revisionId: "rev-1",
        media: [
          media({ mediaId: "m-1", processingState: "promotion_pending" }),
        ],
      },
      { beginAttempt, copyMedia, finalize },
    );

    expect(copyMedia).toHaveBeenCalledWith("m-1", "attempt-4");
    expect(result.ok).toBe(true);
  });

  // Round A review, MUST-FIX 1: a google_drive item needs no bucket copy
  // at all -- its derivative in Drive already is the public file.
  // finalize_story_publication() promotes it directly; calling copyMedia
  // for one would fail outright (no processed_private_storage_path to
  // read). storageBackend is optional, so this is purely additive --
  // every test above (which never sets it) is untouched.
  it("skips a processed google_drive item's bucket copy, but still finalizes", async () => {
    const beginAttempt = vi.fn().mockResolvedValue("attempt-5");
    const copyMedia = vi.fn().mockResolvedValue(undefined);
    const finalize = vi.fn().mockResolvedValue(undefined);

    const result = await runApproveOrchestration(
      {
        revisionId: "rev-1",
        media: [
          media({
            mediaId: "m-drive",
            processingState: "processed",
            storageBackend: "google_drive",
          }),
          media({
            mediaId: "m-supabase",
            processingState: "processed",
            storageBackend: "supabase",
          }),
        ],
      },
      { beginAttempt, copyMedia, finalize },
    );

    expect(result).toEqual({ ok: true, approvalAttemptId: "attempt-5" });
    // Only the supabase item is copied -- the Drive item is skipped
    // entirely, never passed to copyMedia at all.
    expect(copyMedia).toHaveBeenCalledTimes(1);
    expect(copyMedia).toHaveBeenCalledWith("m-supabase", "attempt-5");
    expect(finalize).toHaveBeenCalledWith({
      revisionId: "rev-1",
      approvalAttemptId: "attempt-5",
      userFacingReason: undefined,
      editorNote: undefined,
    });
  });

  it("a google_drive item already promoted is skipped too, same as any backend", async () => {
    const beginAttempt = vi.fn().mockResolvedValue("attempt-6");
    const copyMedia = vi.fn().mockResolvedValue(undefined);
    const finalize = vi.fn().mockResolvedValue(undefined);

    const result = await runApproveOrchestration(
      {
        revisionId: "rev-1",
        media: [
          media({
            mediaId: "m-drive-promoted",
            processingState: "promoted",
            storageBackend: "google_drive",
          }),
        ],
      },
      { beginAttempt, copyMedia, finalize },
    );

    expect(result.ok).toBe(true);
    expect(copyMedia).not.toHaveBeenCalled();
  });

  // begin_story_publication_attempt() returns the existing active attempt to
  // the moderator who started it, or to an admin
  // (20261125100000_resume_active_publication_attempt.sql). These model the
  // whole retry: what the approve button does after a failure.
  describe("retrying after a failure", () => {
    it("resumes the same attempt after a copy failure and publishes", async () => {
      const beginAttempt = vi.fn().mockResolvedValue("attempt-7");
      const copyMedia = vi
        .fn()
        .mockResolvedValueOnce(undefined) // first try, m-1
        .mockRejectedValueOnce(new Error("byte verification failed")) // m-2
        .mockResolvedValue(undefined); // the retry
      const finalize = vi.fn().mockResolvedValue(undefined);
      const deps = { beginAttempt, copyMedia, finalize };

      const first = await runApproveOrchestration(
        {
          revisionId: "rev-1",
          media: [
            media({ mediaId: "m-1" }),
            media({ mediaId: "m-2" }),
            media({ mediaId: "m-3" }),
          ],
        },
        deps,
      );
      expect(first).toMatchObject({ ok: false, stage: "copy_media" });

      // The retry re-reads media: m-1 and m-2 were flipped by the first try,
      // m-3 was never reached.
      const second = await runApproveOrchestration(
        {
          revisionId: "rev-1",
          media: [
            media({ mediaId: "m-1", processingState: "promotion_pending" }),
            media({ mediaId: "m-2", processingState: "promotion_pending" }),
            media({ mediaId: "m-3" }),
          ],
        },
        deps,
      );

      expect(second).toEqual({ ok: true, approvalAttemptId: "attempt-7" });
      expect(copyMedia.mock.calls.slice(2)).toEqual([
        ["m-1", "attempt-7"],
        ["m-2", "attempt-7"],
        ["m-3", "attempt-7"],
      ]);
      expect(finalize).toHaveBeenCalledTimes(1);
      expect(finalize).toHaveBeenCalledWith(
        expect.objectContaining({ approvalAttemptId: "attempt-7" }),
      );
    });

    it("resumes the same attempt after a finalize failure and publishes", async () => {
      const beginAttempt = vi.fn().mockResolvedValue("attempt-8");
      const copyMedia = vi.fn().mockResolvedValue(undefined);
      const finalize = vi
        .fn()
        .mockRejectedValueOnce(new Error("no currently-valid consent grant"))
        .mockResolvedValueOnce(undefined);
      const deps = { beginAttempt, copyMedia, finalize };
      const params = { revisionId: "rev-1", media: [] };

      expect(await runApproveOrchestration(params, deps)).toMatchObject({
        ok: false,
        stage: "finalize",
        approvalAttemptId: "attempt-8",
      });
      expect(await runApproveOrchestration(params, deps)).toEqual({
        ok: true,
        approvalAttemptId: "attempt-8",
      });
    });

    it("uses whichever id begin returns, so a replaced attempt works too", async () => {
      // After the cleanup script resolved the old attempt's copies, begin
      // abandons it and returns a new id instead of the old one.
      const beginAttempt = vi
        .fn()
        .mockResolvedValueOnce("attempt-old")
        .mockResolvedValueOnce("attempt-new");
      const copyMedia = vi
        .fn()
        .mockRejectedValueOnce(new Error("storage down"))
        .mockResolvedValue(undefined);
      const finalize = vi.fn().mockResolvedValue(undefined);
      const deps = { beginAttempt, copyMedia, finalize };
      const params = {
        revisionId: "rev-1",
        media: [media({ mediaId: "m-1" })],
      };

      await runApproveOrchestration(params, deps);
      const second = await runApproveOrchestration(params, deps);

      expect(second).toEqual({ ok: true, approvalAttemptId: "attempt-new" });
      expect(copyMedia).toHaveBeenLastCalledWith("m-1", "attempt-new");
    });
  });
});
