import "server-only";
import { createHash } from "node:crypto";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  DriveApiError,
  DriveConnectionError,
  deleteFilePermanently,
  downloadFileBytes,
  getAccessToken,
  uploadDerivativeFile,
} from "@/lib/drive/drive-client";
import {
  deleteMovedSupabaseCopies,
  downloadProcessedDerivativeForMove,
} from "@/lib/story/image-pipeline";
import {
  ensureStoryFolder,
  extensionForMimeType,
  syncStoryFolder,
} from "@/lib/story/drive-folders";

/**
 * "Move my existing photos to Drive" (docs/google-drive-integration.md
 * section 9, Supabase -> Drive only). The orchestrator section 9 asks for:
 * it holds no secret of its own. The Supabase side (service role) lives in
 * lib/story/image-pipeline.ts, the Drive side in lib/drive/drive-client.ts,
 * and only plain bytes pass between them here. Every DB step goes through
 * the contributor's own session client and the owner-checked RPCs in
 * supabase/migrations/20261008053425_story_media_move_to_drive.sql.
 *
 * The browser drives the loop -- begin, then one moveNextPhotoToDrive()
 * call per photo, then finish -- so each request handles one photo and a
 * closed tab just pauses the move. Per photo:
 *
 *   claim -> download derivative (sha256-checked) -> upload to the story's
 *   Drive folder -> record the Drive id -> download it back and compare
 *   sha256 -> flip story_media in one transaction -> delete old copies
 *
 * Nothing before the flip changes what anyone sees. A failure before the
 * flip deletes the new Drive file (best effort) and leaves the photo fully
 * on Supabase, reported back as "could not move".
 */

export type DriveMoveFailureReason =
  | "being_published"
  | "source_missing"
  | "verify_failed"
  | "changed_meanwhile"
  | "unknown";

export type DriveMoveFatalReason =
  | "drive_not_connected"
  | "drive_unavailable"
  | "already_running"
  | "run_not_active";

/** Stops the whole run: nothing more can move until the contributor acts. */
export class DriveMoveFatalError extends Error {
  constructor(public readonly reason: DriveMoveFatalReason) {
    super(reason);
    this.name = "DriveMoveFatalError";
  }
}

/** One photo couldn't move; the run carries on with the next one. */
class DriveMovePhotoError extends Error {
  constructor(public readonly reason: DriveMoveFailureReason) {
    super(reason);
  }
}

export type DriveMoveStep =
  | { done: true }
  | { done: false; outcome: "moved"; hadPublicCopy: boolean }
  | {
      done: false;
      outcome: "failed";
      storyTitle: string;
      reason: DriveMoveFailureReason;
    };

const KNOWN_FAILURE_REASONS: readonly DriveMoveFailureReason[] = [
  "being_published",
  "source_missing",
  "verify_failed",
  "changed_meanwhile",
];

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("You must be signed in.");
  return user;
}

function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Maps an RPC's raised message onto a fatal reason, if it is one. */
function fatalFromRpcMessage(message: string): DriveMoveFatalError | null {
  if (message.includes("drive_not_connected")) {
    return new DriveMoveFatalError("drive_not_connected");
  }
  if (message.includes("move_already_running")) {
    return new DriveMoveFatalError("already_running");
  }
  if (message.includes("move_run_not_active")) {
    return new DriveMoveFatalError("run_not_active");
  }
  return null;
}

/**
 * A lost connection, or Drive refusing us (401/403 covers revoked access
 * and a full Drive; 429 is rate limiting), would fail every remaining photo
 * the same way -- stop the run instead of reporting each one.
 */
function fatalFromDriveError(err: unknown): DriveMoveFatalError | null {
  if (err instanceof DriveMoveFatalError) return err;
  if (err instanceof DriveConnectionError) {
    return new DriveMoveFatalError("drive_not_connected");
  }
  if (
    err instanceof DriveApiError &&
    (err.status === 401 || err.status === 403 || err.status === 429)
  ) {
    return new DriveMoveFatalError("drive_unavailable");
  }
  return null;
}

/**
 * Deletes the old Supabase copies of every moved photo that is due (see
 * list_my_drive_move_cleanup_due). Best effort: a failure is logged and the
 * job stays `switched`, so the next run tries again.
 */
export async function cleanUpMovedPhotos(): Promise<number> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_my_drive_move_cleanup_due");
  if (error) {
    console.error("list_my_drive_move_cleanup_due failed", error.message);
    return 0;
  }
  let deleted = 0;
  for (const { job_id: jobId } of data ?? []) {
    try {
      if (await deleteMovedSupabaseCopies(jobId)) deleted += 1;
    } catch (err) {
      console.error("Failed to delete old Supabase copies after a move", {
        jobId,
        error: err instanceof Error ? err.message : err,
      });
    }
  }
  return deleted;
}

export async function beginDriveMoveRun(): Promise<{
  runId: string;
  total: number;
}> {
  await requireUser();
  await cleanUpMovedPhotos();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("begin_drive_move_run");
  if (error) {
    throw (
      fatalFromRpcMessage(error.message) ??
      new Error(`begin_drive_move_run failed: ${error.message}`)
    );
  }
  const row = data?.[0];
  if (!row) throw new Error("begin_drive_move_run returned no run");
  return { runId: row.run_id, total: row.total };
}

export async function moveNextPhotoToDrive(
  runId: string,
): Promise<DriveMoveStep> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("claim_next_drive_move", {
    p_run_id: runId,
  });
  if (error) {
    throw (
      fatalFromRpcMessage(error.message) ??
      new Error(`claim_next_drive_move failed: ${error.message}`)
    );
  }
  const claim = data?.[0];
  if (!claim) return { done: true };

  const storyTitle = claim.story_title ?? "";
  const fail = async (
    reason: DriveMoveFailureReason,
  ): Promise<DriveMoveStep> => {
    await supabase.rpc("record_drive_move_failed", {
      p_job_id: claim.job_id,
      p_error_code: reason,
    });
    return { done: false, outcome: "failed", storyTitle, reason };
  };

  if (claim.job_status === "failed") {
    const reason = KNOWN_FAILURE_REASONS.find((r) => r === claim.error_code);
    return {
      done: false,
      outcome: "failed",
      storyTitle,
      reason: reason ?? "unknown",
    };
  }

  let accessToken: string;
  try {
    accessToken = await getAccessToken(user.id);
  } catch (err) {
    await fail("unknown");
    throw fatalFromDriveError(err) ?? err;
  }

  // Drive files left behind by an earlier attempt that died before its
  // flip. Nothing references them; the claim already closed their jobs.
  for (const staleId of claim.stale_drive_file_ids ?? []) {
    await deleteFilePermanently(accessToken, staleId, user.id).catch((err) => {
      console.error("Failed to delete a Drive file from an abandoned move", {
        staleId,
        error: err instanceof Error ? err.message : err,
      });
    });
  }

  let source: Awaited<ReturnType<typeof downloadProcessedDerivativeForMove>>;
  try {
    source = await downloadProcessedDerivativeForMove(claim.media_id);
  } catch (err) {
    console.error("Move to Drive: could not read the Supabase derivative", {
      mediaId: claim.media_id,
      error: err instanceof Error ? err.message : err,
    });
    return fail("source_missing");
  }

  let driveFileId: string | null = null;
  let flipOutcomeUnknown = false;
  try {
    const folderId = await ensureStoryFolder(
      supabase,
      accessToken,
      user.id,
      claim.story_id,
    );

    // Same NN.ext naming as a fresh Drive upload; finish's folder sync
    // puts the final numbers in display order.
    const { data: driveMedia, error: listError } = await supabase.rpc(
      "list_story_drive_media_for_sync",
      { p_story_id: claim.story_id },
    );
    if (listError) {
      throw new Error(
        `list_story_drive_media_for_sync failed: ${listError.message}`,
      );
    }
    const name = `${String((driveMedia?.length ?? 0) + 1).padStart(2, "0")}.${extensionForMimeType(source.mimeType)}`;

    driveFileId = await uploadDerivativeFile(
      accessToken,
      folderId,
      name,
      source.bytes,
      source.mimeType,
      user.id,
    );

    const { error: copiedError } = await supabase.rpc(
      "record_drive_move_copied",
      {
        p_job_id: claim.job_id,
        p_drive_file_id: driveFileId,
        p_drive_folder_id: folderId,
      },
    );
    if (copiedError) {
      throw (
        fatalFromRpcMessage(copiedError.message) ??
        new Error(`record_drive_move_copied failed: ${copiedError.message}`)
      );
    }

    // Verify what Drive actually stored, not what we sent.
    const stored = await downloadFileBytes(accessToken, driveFileId, user.id);
    if (sha256Hex(stored) !== source.sha256) {
      throw new DriveMovePhotoError("verify_failed");
    }

    const { data: switched, error: switchError } = await supabase.rpc(
      "switch_story_media_to_drive",
      { p_job_id: claim.job_id, p_sha256: source.sha256 },
    );
    if (switchError) {
      const message = switchError.message;
      if (message.includes("media_not_movable")) {
        throw new DriveMovePhotoError(
          // A moderator started publishing it after we claimed it.
          "being_published",
        );
      }
      if (message.includes("media_changed")) {
        throw new DriveMovePhotoError("changed_meanwhile");
      }
      // Any other error (e.g. the response was lost) may mean the flip DID
      // commit, so the Drive file may already be the live copy. Keep it:
      // if the job is still `copied`, the next claim hands it back as stale
      // and deletes it then.
      driveFileId = null;
      flipOutcomeUnknown = true;
      throw (
        fatalFromRpcMessage(message) ??
        new Error(`switch_story_media_to_drive failed: ${message}`)
      );
    }

    const hadPublicCopy = switched?.[0]?.had_public_copy ?? true;
    if (!hadPublicCopy) {
      // Never published: no page can be pointing at the old copies, so
      // delete them (raw original with its GPS included) right away.
      try {
        await deleteMovedSupabaseCopies(claim.job_id);
      } catch (err) {
        console.error("Failed to delete old Supabase copies after a move", {
          jobId: claim.job_id,
          error: err instanceof Error ? err.message : err,
        });
      }
    }
    return { done: false, outcome: "moved", hadPublicCopy };
  } catch (err) {
    if (driveFileId) {
      const orphan = driveFileId;
      await deleteFilePermanently(accessToken, orphan, user.id).catch(
        (deleteErr) => {
          console.error("Failed to delete Drive copy of a failed move", {
            mediaId: claim.media_id,
            driveFileId: orphan,
            error: deleteErr instanceof Error ? deleteErr.message : deleteErr,
          });
        },
      );
    }

    const fatal = fatalFromDriveError(err);
    if (flipOutcomeUnknown) {
      // Leave the job as it is (copied or switched): see above.
      console.error("Move to Drive: flip outcome unknown", {
        jobId: claim.job_id,
        error: err instanceof Error ? err.message : err,
      });
      if (fatal) throw fatal;
      return { done: false, outcome: "failed", storyTitle, reason: "unknown" };
    }
    if (err instanceof DriveMovePhotoError) {
      return fail(err.reason);
    }
    console.error("Move to Drive failed for one photo", {
      mediaId: claim.media_id,
      error: err instanceof Error ? err.message : err,
    });
    const step = await fail("unknown");
    if (fatal) throw fatal;
    return step;
  }
}

/**
 * Closes the run, renumbers the Drive folder of every story that had a
 * photo moved (after the response, best effort, same as uploads do), and
 * deletes whatever old copies are already due.
 */
export async function finishDriveMoveRun(runId: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("finish_drive_move_run", {
    p_run_id: runId,
  });
  if (error) {
    throw new Error(`finish_drive_move_run failed: ${error.message}`);
  }
  const storyIds = (data ?? []).map((row) => row.story_id);
  if (storyIds.length > 0) {
    after(async () => {
      for (const storyId of storyIds) {
        await syncStoryFolder(user.id, storyId);
      }
    });
  }
  await cleanUpMovedPhotos();
}

export type DriveMoveSummary = {
  movableCount: number;
  cleanupPendingCount: number;
  runInProgress: boolean;
};

/** For the Account -> Google Drive tab. Null when it can't be read. */
export async function getMyDriveMoveSummary(): Promise<DriveMoveSummary | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_my_drive_move_summary");
    const row = data?.[0];
    if (error || !row) return null;
    return {
      movableCount: row.movable_count,
      cleanupPendingCount: row.cleanup_pending_count,
      runInProgress: row.run_in_progress,
    };
  } catch {
    return null;
  }
}
