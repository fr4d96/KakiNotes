import type { ModeratorMediaItem } from "@/lib/story/moderation";

/**
 * Pure(-ish) orchestration for the approve flow: begin a publication
 * attempt -> copy every not-already-promoted media item -> finalize.
 * Factored out of the Server Action (app/(moderation)/moderation/stories/[id]/actions.ts)
 * so the partial-failure behavior is unit-testable without a real Supabase
 * client or real storage -- every side-effecting operation is injected via
 * `deps`, matching this module's only job: decide WHAT to call and WHEN to
 * stop, not perform the calls itself.
 *
 * Partial-failure contract (this is the one place that decides it):
 *   - begin fails -> return early. begin returns the revision's existing
 *     active attempt when the caller started it or is an admin
 *     (20261125100000_resume_active_publication_attempt.sql), so this means
 *     the caller may not act on this revision right now, not that a retry
 *     is stuck.
 *   - ANY media copy fails -> STOP immediately, do NOT call finalize. The
 *     attempt is left in its `active` state (a later retry of this whole
 *     orchestration resumes the same attempt id, or
 *     an explicit reject/changes_requested via moderate_revision(), can
 *     still resolve it cleanly -- moderate_revision() abandons an active
 *     attempt and reverts any promotion_pending media back to processed).
 *     The failure is returned with the attempt id and the specific media
 *     id that failed, never silently swallowed.
 *   - finalize fails -> also returned with the attempt id (still active,
 *     media already copied/verified) so a retry resumes it. The copied
 *     items are still `promotion_pending`, so copyMedia runs for them again,
 *     but it only re-checks the bytes already in the public bucket.
 *   - Cache invalidation is the caller's job, only after `{ ok: true }`.
 */
export type ApproveOrchestrationDeps = {
  beginAttempt: (revisionId: string) => Promise<string>;
  copyMedia: (mediaId: string, approvalAttemptId: string) => Promise<void>;
  finalize: (params: {
    revisionId: string;
    approvalAttemptId: string;
    userFacingReason?: string;
    editorNote?: string;
  }) => Promise<void>;
};

export type ApproveOrchestrationResult =
  | { ok: true; approvalAttemptId: string }
  | {
      ok: false;
      stage: "begin" | "copy_media" | "finalize";
      error: string;
      mediaId?: string;
      approvalAttemptId?: string;
    };

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Unknown error";
}

export async function runApproveOrchestration(
  params: {
    revisionId: string;
    media: ModeratorMediaItem[];
    userFacingReason?: string;
    editorNote?: string;
  },
  deps: ApproveOrchestrationDeps,
): Promise<ApproveOrchestrationResult> {
  let approvalAttemptId: string;
  try {
    approvalAttemptId = await deps.beginAttempt(params.revisionId);
  } catch (err) {
    return { ok: false, stage: "begin", error: errorMessage(err) };
  }

  // Round A review MUST-FIX 1: a google_drive item needs no bucket-copy
  // step at all -- its processed derivative in Drive already IS the
  // public file, served by the proxy. finalize_story_publication()
  // promotes a 'processed' google_drive row directly; calling copyMedia()
  // for one would fail (there is no processed_private_storage_path to
  // read -- google_drive rows never have one). storageBackend is optional
  // on ModeratorMediaItem, so an item that never set it (every existing
  // caller/test, before this field existed) is treated as supabase here,
  // unchanged from before this filter gained the second clause.
  const toCopy = params.media.filter(
    (item) =>
      item.processingState !== "promoted" &&
      item.storageBackend !== "google_drive",
  );

  for (const item of toCopy) {
    try {
      await deps.copyMedia(item.mediaId, approvalAttemptId);
    } catch (err) {
      // Do NOT call finalize -- leave the attempt active/recoverable.
      return {
        ok: false,
        stage: "copy_media",
        error: errorMessage(err),
        mediaId: item.mediaId,
        approvalAttemptId,
      };
    }
  }

  try {
    await deps.finalize({
      revisionId: params.revisionId,
      approvalAttemptId,
      userFacingReason: params.userFacingReason,
      editorNote: params.editorNote,
    });
  } catch (err) {
    return {
      ok: false,
      stage: "finalize",
      error: errorMessage(err),
      approvalAttemptId,
    };
  }

  return { ok: true, approvalAttemptId };
}
