import "server-only";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  getAccessToken,
  ensureAppFolders,
  startResumableUploadSession,
  getFileMetadata,
  downloadFileBytes,
  uploadDerivativeFile,
  deleteFilePermanently,
} from "@/lib/drive/drive-client";
import { processImageBytesInMemory } from "@/lib/story/image-pipeline";
import {
  MAX_UPLOAD_BYTES,
  MAX_HEIC_UPLOAD_BYTES,
} from "@/lib/story/image-validation";
import {
  ensureStoryFolder,
  syncStoryFolder,
  extensionForMimeType,
} from "@/lib/story/drive-folders";

/**
 * The only module allowed to import lib/drive/drive-client.ts from outside
 * lib/drive/** itself (not enforced by an ESLint rule this round — see this
 * task's own eslint instructions, which only required drive-client.ts to be
 * importable from lib/drive/**, already true via the existing
 * no-restricted-imports allowlist — kept as a convention, matching
 * docs/google-drive-integration.md section 4's "drive-sync.ts / token-store.ts
 * pair" design). Does NOT import lib/supabase/admin.ts — DB writes for the
 * Drive path go through the normal session client calling the
 * SECURITY DEFINER RPCs from supabase/migrations/20261007063355_story_media_
 * drive_backend.sql, exactly like every other story mutation in
 * lib/story/mutations.ts.
 *
 * export const maxDuration = 60 (seconds): this repo has no maxDuration
 * configured anywhere else (checked next.config.ts and the repo root for a
 * vercel.json — neither sets one). 60s matches docs/google-drive-
 * integration.md section 4(c)/12 Decision Q10 exactly: within the default
 * limit on every current Vercel plan tier (no upgrade needed), and well
 * above what download + sharp pipeline + re-upload should normally take
 * for a file at MAX_HEIC_UPLOAD_BYTES. finalizeDriveMediaUpload is the one
 * function in this module that can run that long; a future caller (the
 * Server Action wrapping it, once Round B wires the editor UI) should
 * re-export this same constant rather than picking its own number.
 */
export const maxDuration = 60;

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("You must be signed in.");
  return user;
}

export type StoryMediaUploadMode = "supabase" | "google_drive";

/**
 * Round B: the ONE server-side decision of which backend a new upload for
 * this revision should use. The client (image-upload-manager.tsx) only
 * ever follows this — it has no way to assert its own mode, and this
 * function never trusts anything the caller sends beyond the revision id.
 * Defaults to "supabase" on ANY uncertainty (signed out, no such revision,
 * the RPC itself erroring) — never defaults to Drive.
 */
export async function getStoryMediaUploadMode(
  revisionId: string,
): Promise<StoryMediaUploadMode> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_story_media_upload_mode", {
      p_revision_id: revisionId,
    });
    if (error || data !== "google_drive") return "supabase";
    return "google_drive";
  } catch {
    return "supabase";
  }
}

export type BeginDriveMediaUploadResult = {
  mediaId: string;
  sessionUri: string;
};

/**
 * Drive-mode sibling of beginStoryMediaUpload (lib/story/mutations.ts):
 * reserves the story_media row via begin_drive_media_upload() (which
 * independently re-derives edit rights AND an active Drive connection —
 * Rule 2/3, never trusts a client flag), then opens a Drive resumable
 * upload session in the contributor's own staging folder. Returns only the
 * session URI — never an access token — to the caller, which hands it to
 * the browser for the direct PUT (Option D, section 4 step 2-3).
 */
export async function beginDriveMediaUpload(
  revisionId: string,
  sourceMimeType: "image/jpeg" | "image/png" | "image/webp" | "image/heic",
  sizeBytes: number,
): Promise<BeginDriveMediaUploadResult> {
  const user = await requireUser();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("begin_drive_media_upload", {
    p_revision_id: revisionId,
    p_source_mime_type: sourceMimeType,
  });
  if (error || !data || data.length === 0) {
    throw new Error(error?.message ?? "Failed to reserve a Drive upload slot");
  }
  const mediaId = data[0].media_id;

  const accessToken = await getAccessToken(user.id);
  const { stagingFolderId } = await ensureAppFolders(user.id, accessToken);
  const { sessionUri } = await startResumableUploadSession(
    accessToken,
    stagingFolderId,
    mediaId,
    sourceMimeType,
    sizeBytes,
    user.id,
  );

  return { mediaId, sessionUri };
}

export class DriveFinalizeRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DriveFinalizeRejectedError";
  }
}

function maxBytesFor(mimeType: string): number {
  return mimeType === "image/heic" || mimeType === "image/heif"
    ? MAX_HEIC_UPLOAD_BYTES
    : MAX_UPLOAD_BYTES;
}

/**
 * Verifies, then finishes, a Drive-mode upload (section 4, step 4). Order,
 * exactly as the task requires:
 *
 *   1. Re-derive the user and check edit rights — authorize_drive_media_
 *      finalize() raises before this function touches Drive at all if the
 *      caller has no edit rights, or the reservation is not a pending,
 *      unexpired, google_drive-backend row.
 *   2. Fetch the Drive file's REAL metadata (never trust the browser's
 *      claimed driveFileId at face value — Rule 2) and reject unless
 *      appProperties.kakinotes_reservation matches this exact mediaId,
 *      appProperties.kakinotes_stage === 'raw', its parent is this
 *      contributor's staging folder, and its size is within the existing
 *      MAX_UPLOAD_BYTES/MAX_HEIC_UPLOAD_BYTES ceiling. A rejection here
 *      downloads and deletes NOTHING.
 *   3. Only once that passes: download, run the pipeline, upload the
 *      derivative as a new file, record it via finalize_drive_media_
 *      upload(), then permanently delete the raw staging file.
 *
 * If anything fails AFTER the derivative has been uploaded to Drive but
 * BEFORE finalize_drive_media_upload() has recorded it (round A review,
 * SMALL 4): nothing in the DB ends up pointing at that file, and the
 * slice-4 cleanup sweep (not built this round) only ever looks at the
 * STAGING subfolder, never the real app folder -- so an orphaned
 * derivative here would never be found by anything. This function makes a
 * best-effort files.delete() of that exact derivative before re-throwing;
 * a failed cleanup delete is logged, never thrown (it must not mask the
 * real error), and the original failure is always re-thrown either way so
 * the caller never sees this as a success.
 */
export async function finalizeDriveMediaUpload(
  mediaId: string,
  expectedVersion: number,
  driveFileId: string,
): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();

  // 1. Edit rights + reservation-state pre-check, before any Drive call.
  // authorize_drive_media_finalize_v2 is a NEW function (supabase/migrations/
  // 20261007190006_story_drive_folders.sql) -- not a DROP+CREATE reshape of
  // authorize_drive_media_finalize, which is left untouched -- so there is
  // no window where this migration's shape and this code's expectations can
  // disagree. It additionally returns the reservation's story_id, needed
  // below to write the derivative directly into the story's own Drive
  // folder instead of the bare app folder.
  const { data: storyId, error: authError } = await supabase.rpc(
    "authorize_drive_media_finalize_v2",
    { p_media_id: mediaId },
  );
  if (authError || !storyId) {
    throw new DriveFinalizeRejectedError(
      authError?.message ?? "not authorized",
    );
  }

  const accessToken = await getAccessToken(user.id);
  const { stagingFolderId } = await ensureAppFolders(user.id, accessToken);

  // 2. Verify the Drive file's real metadata — never the browser's claim.
  const metadata = await getFileMetadata(accessToken, driveFileId, user.id);
  const reservationMatches =
    metadata.appProperties.kakinotes_reservation === mediaId;
  const stageMatches = metadata.appProperties.kakinotes_stage === "raw";
  const parentMatches = metadata.parents.includes(stagingFolderId);
  const declaredMimeType =
    metadata.appProperties.kakinotes_declared_mime ?? "image/jpeg";
  const withinSizeLimit =
    metadata.size > 0 && metadata.size <= maxBytesFor(declaredMimeType);

  if (
    !reservationMatches ||
    !stageMatches ||
    !parentMatches ||
    !withinSizeLimit
  ) {
    throw new DriveFinalizeRejectedError(
      `Drive file ${driveFileId} failed verification for reservation ${mediaId} (reservation=${reservationMatches}, stage=${stageMatches}, parent=${parentMatches}, size=${withinSizeLimit})`,
    );
  }

  // 3. Download, process, upload, record, delete raw — in that order.
  const rawBytes = await downloadFileBytes(accessToken, driveFileId, user.id);
  const processed = await processImageBytesInMemory(rawBytes);

  // The derivative is written straight into the story's OWN Drive folder
  // (created, or renamed to match the current title, right here) — never
  // the bare app folder followed by a later move. ensureStoryFolder() is
  // NOT best-effort: a failure here must fail the upload, since there is
  // nowhere correct to put the derivative otherwise.
  const storyFolderId = await ensureStoryFolder(
    supabase,
    accessToken,
    user.id,
    storyId,
  );

  // Name it NN.ext at upload time (count of already-attached Drive media +
  // 1) instead of a content-hash name renamed later — this is what lets
  // finalize skip waiting on a full syncStoryFolder() pass below: the new
  // file already has its final name/location the moment it's uploaded.
  // Only an EXISTING file whose number is somehow wrong (a prior partial
  // sync) would still need fixing, which the deferred syncStoryFolder below
  // still catches, just without the user waiting on it.
  const { data: existingDriveMedia, error: listError } = await supabase.rpc(
    "list_story_drive_media_for_sync",
    { p_story_id: storyId },
  );
  if (listError) {
    throw new Error(
      `Failed to count existing Drive media for story ${storyId}: ${listError.message}`,
    );
  }
  const nextNumber = (existingDriveMedia?.length ?? 0) + 1;
  const derivativeName = `${String(nextNumber).padStart(2, "0")}.${extensionForMimeType(processed.processedMimeType)}`;

  const driveProcessedFileId = await uploadDerivativeFile(
    accessToken,
    storyFolderId,
    derivativeName,
    processed.bytes,
    processed.processedMimeType,
    user.id,
  );

  try {
    const { error: finalizeError } = await supabase.rpc(
      "finalize_drive_media_upload",
      {
        p_media_id: mediaId,
        p_expected_version: expectedVersion,
        p_drive_processed_file_id: driveProcessedFileId,
        p_drive_folder_id: storyFolderId,
        p_source_mime_type: processed.sourceMimeType,
        p_source_width: processed.sourceWidth,
        p_source_height: processed.sourceHeight,
        p_source_file_size_bytes: metadata.size,
        p_processed_mime_type: processed.processedMimeType,
        p_processed_file_size_bytes: processed.bytes.byteLength,
        p_processed_width: processed.processedWidth,
        p_processed_height: processed.processedHeight,
        p_sha256: processed.sha256,
      },
    );
    if (finalizeError) {
      throw new Error(
        `finalize_drive_media_upload failed: ${finalizeError.message}`,
      );
    }
  } catch (err) {
    // SMALL 4 (round A review): recording failed, so nothing in the DB
    // points at this derivative — it would otherwise be an orphaned file
    // in the contributor's Kakinotes folder that the slice-4 sweep (which
    // only ever looks at the STAGING subfolder) can never find or clean
    // up. Best-effort delete it before re-throwing: log a delete failure
    // rather than letting it mask the real error, and still re-throw the
    // original failure either way so the caller never sees this as a
    // success.
    await deleteFilePermanently(
      accessToken,
      driveProcessedFileId,
      user.id,
    ).catch((deleteErr) => {
      console.error("Failed to clean up orphaned Drive derivative", {
        mediaId,
        driveProcessedFileId,
        error: deleteErr instanceof Error ? deleteErr.message : deleteErr,
      });
    });
    throw err instanceof Error
      ? err
      : new Error("finalize_drive_media_upload failed with a non-Error throw");
  }

  // From here on, the DB row is durably recorded and correct — everything
  // left is cleanup/polish the caller never needs to wait for. Deferred to
  // next/server's after() (confirmed to still carry the signed-in session:
  // Server Actions are Server Functions, and cookies()-based clients work
  // inside after() for those — see app/(contributor)/stories/[id]/edit/
  // actions.ts's own after() usage and its doc-citation comment), so the
  // response returns right after the line above instead of waiting on:
  //   - deleting the now-unneeded raw staging file (privacy-motivated, but
  //     a few hundred ms of extra lifetime for a file no reader can ever
  //     reach changes nothing observable), and
  //   - syncStoryFolder's full renumber pass, which with the new file
  //     already correctly named is now almost always a fast no-op.
  after(async () => {
    await deleteFilePermanently(accessToken, driveFileId, user.id).catch(
      (err) => {
        console.error("Failed to delete Drive staging file", {
          mediaId,
          driveFileId,
          error: err instanceof Error ? err.message : err,
        });
      },
    );
    await syncStoryFolder(user.id, storyId);
  });
}
