"use server";

import { getTranslations } from "next-intl/server";

import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  authorizeHeicTranscode,
  beginStoryMediaUpload,
  cancelPendingStoryMediaUpload,
  finalizeStoryMediaUpload,
  recordHeicTranscodedOriginal,
  storyVersionForMedia,
} from "@/lib/story/mutations";
// The one place the "Stale version for ..." message is recognised, shared
// with the client-side mutation queue rather than re-written here — the
// message shape is the RPC's, and two copies of that regex would drift.
import { isStaleVersionConflict } from "@/lib/story/mutation-queue";
import {
  processStoryMedia,
  transcodeStagedHeicUpload,
} from "@/lib/story/image-pipeline";
import { HeicTranscodeError } from "@/lib/story/heic";
import { getErrorMessage } from "@/lib/errors";

/**
 * Replaces app/(contributor)/stories/[id]/edit/upload/route.ts, which
 * relayed the raw upload bytes through this server on their way to Storage.
 * That relay was the exact hop with the ~4.5 MiB effective ceiling: Vercel
 * Node.js Functions synchronously invoke via AWS Lambda underneath, whose
 * request payload is base64-encoded for binary bodies, and Lambda's own 6 MB
 * synchronous-invocation cap works out to roughly that many raw bytes
 * surviving the round trip. Root-caused live: a 24MP iPhone HEIC (4.1 MB)
 * was rejected with a 413 carrying a non-JSON body — proof the platform
 * rejected the request before this app's own code (which always returns
 * JSON) ever ran — while a 12MP HEIC from the same phone succeeded
 * consistently.
 *
 * The fix moves the raw bytes off this path entirely: the browser now
 * uploads directly to Supabase Storage using its own session
 * (components/story/image-upload-manager.tsx), authorized by the exact
 * same RLS policy (_can_write_reserved_media_path) that already scoped
 * writes to auth.uid() — not "must come from our server" — so nothing
 * about the authorization MODEL changed, only where the bytes travel.
 * Every Server Action below is bytes-free: UUIDs and small strings only.
 *
 * Three actions, called in sequence by the client:
 *   1. beginMediaUploadAction — reserve a slot + path (unchanged RPC).
 *   2. transcodeHeicUploadAction — HEIC only. The browser has already
 *      staged the raw HEIC directly into the private bucket; this
 *      authorizes, downloads it (an ordinary OUTBOUND request, never
 *      subject to the inbound-body limit), transcodes via the completely
 *      unchanged lib/story/heic.ts, and rewrites the reservation onto the
 *      resulting original.jpg.
 *   3. finalizeMediaUploadAction — unchanged finalize_story_media_upload
 *      (already verified uploads via storage.objects directly, never the
 *      caller's claim), then processStoryMedia with no bytes passed in —
 *      its existing fallback path downloads from storage itself.
 */

const uuidSchema = z.uuid();

export async function beginMediaUploadAction(
  revisionId: string,
  sourceMimeType: "image/jpeg" | "image/png" | "image/webp" | "image/heic",
): Promise<{ mediaId: string; reservedPath: string } | { error: string }> {
  const [tErr, tCommon] = await Promise.all([
    getTranslations("actionErrors"),
    getTranslations("common"),
  ]);
  const user = await getCurrentUser();
  if (!user) return { error: tCommon("mustBeSignedIn") };

  const parsedRevisionId = uuidSchema.safeParse(revisionId);
  if (!parsedRevisionId.success) return { error: tErr("invalidRevision") };

  try {
    const reserved = await beginStoryMediaUpload(
      parsedRevisionId.data,
      sourceMimeType,
    );
    return { mediaId: reserved.media_id, reservedPath: reserved.reserved_path };
  } catch (error) {
    return {
      error: getErrorMessage(error, tErr("reserveUploadFailed")),
    };
  }
}

export async function transcodeHeicUploadAction(
  mediaId: string,
): Promise<{ ok: true } | { error: string }> {
  const [tErr, tCommon] = await Promise.all([
    getTranslations("actionErrors"),
    getTranslations("common"),
  ]);
  const user = await getCurrentUser();
  if (!user) return { error: tCommon("mustBeSignedIn") };

  const parsedMediaId = uuidSchema.safeParse(mediaId);
  if (!parsedMediaId.success) return { error: tErr("invalidMedia") };

  try {
    const { story_id, staging_path } = await authorizeHeicTranscode(
      parsedMediaId.data,
    );
    const { jpgPath } = await transcodeStagedHeicUpload(
      parsedMediaId.data,
      story_id,
      staging_path,
    );
    await recordHeicTranscodedOriginal(parsedMediaId.data, jpgPath);
    return { ok: true };
  } catch (error) {
    if (error instanceof HeicTranscodeError) {
      return { error: error.message };
    }
    return {
      error: getErrorMessage(error, tErr("heicConvertFailed")),
    };
  }
}

export async function finalizeMediaUploadAction(
  mediaId: string,
  expectedVersion: number,
  // The server's own version after the bump, so the browser can SET its
  // counter rather than assume "+1" — the retry below can bump from a
  // version the browser never saw, and an assumed increment would leave it
  // one behind and fail the contributor's very next save. Same reasoning,
  // and the same shape, as saveRevisionFieldsAction's `version`.
): Promise<{ mediaId: string; version: number | null } | { error: string }> {
  const [tErr, tCommon] = await Promise.all([
    getTranslations("actionErrors"),
    getTranslations("common"),
  ]);
  const user = await getCurrentUser();
  if (!user) return { error: tCommon("mustBeSignedIn") };

  const parsedMediaId = uuidSchema.safeParse(mediaId);
  if (!parsedMediaId.success) return { error: tErr("invalidMedia") };
  if (!Number.isInteger(expectedVersion)) {
    return { error: tErr("invalidExpectedVersion") };
  }

  try {
    await finalizeStoryMediaUpload(parsedMediaId.data, expectedVersion);
  } catch (error) {
    // A stale version is NOT a failed upload, and it used to be treated as
    // one: the bytes are already in storage, and every other error path here
    // cancels the reservation, so a version that moved on between the
    // browser reading it and this call landing threw the whole upload away
    // and made the contributor pick the file again.
    //
    // finalize_story_media_upload is explicitly built to survive this — its
    // existence, access and state checks all run BEFORE the version
    // comparison, and a repeat call after the row has moved past
    // pending_upload is a no-op (see 20260804090100_story_media_upload_
    // functions.sql). So re-read the live version and try once more.
    //
    // This does not weaken optimistic concurrency (Engineering Rule 21).
    // The version guard exists to stop one writer silently overwriting
    // another's work; finalize overwrites nothing — it inserts a join row
    // and bumps the version — so retrying it against the current version
    // cannot clobber a concurrent edit. Exactly one retry, so a genuinely
    // broken upload still fails instead of looping.
    let recovered = false;
    if (isStaleVersionConflict(error)) {
      const currentVersion = await storyVersionForMedia(parsedMediaId.data);
      if (currentVersion !== null && currentVersion !== expectedVersion) {
        try {
          await finalizeStoryMediaUpload(parsedMediaId.data, currentVersion);
          recovered = true;
        } catch {
          recovered = false;
        }
      }
    }

    if (!recovered) {
      // Abandoned reservations are swept by
      // scripts/cleanup-abandoned-media-uploads.mjs — no inline storage
      // cleanup needed here, matching that script's existing role.
      await cancelPendingStoryMediaUpload(parsedMediaId.data).catch(() => {});
      return {
        error: getErrorMessage(error, tErr("finalizeUploadFailed")),
      };
    }
  }

  // Processing failures are recorded to the DB by processStoryMedia itself
  // (record_story_media_processing_failed) — this action still succeeds
  // from the client's point of view (the image is attached, just not
  // usable until processed); the client polls processingState via the
  // preview/edit media list rather than this response.
  try {
    await processStoryMedia(parsedMediaId.data);
  } catch {
    // Already recorded server-side; nothing further to do here.
  }

  // Read after the bump, not computed from expectedVersion: the retry above
  // may have finalized against a version this browser never held. Null only
  // when the row is unreadable, which the caller treats as "leave my counter
  // alone" rather than guessing.
  const version = await storyVersionForMedia(parsedMediaId.data);

  return { mediaId: parsedMediaId.data, version };
}
