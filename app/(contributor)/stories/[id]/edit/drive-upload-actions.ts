"use server";

import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  getStoryMediaUploadMode,
  beginDriveMediaUpload,
  finalizeDriveMediaUpload,
  DriveFinalizeRejectedError,
} from "@/lib/story/drive-sync";
import { DriveConnectionError } from "@/lib/drive/drive-client";
import { storyVersionForMedia } from "@/lib/story/mutations";
import { getErrorMessage } from "@/lib/errors";

/**
 * Drive-mode siblings of app/(contributor)/stories/[id]/edit/upload-
 * actions.ts's three actions. Kept in a SEPARATE file (not added to that
 * one) so the existing, already-tested Supabase upload actions file is
 * untouched — components/story/image-upload-manager.test.tsx mocks that
 * module exactly as it is today and must keep passing unmodified.
 */

const uuidSchema = z.uuid();
const mimeSchema = z.enum([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
]);

/**
 * The server-side mode decision (lib/story/drive-sync.ts#getStoryMediaUploadMode).
 * Round A review's own rule applies here too: this never raises, and
 * always answers "supabase" for anything it isn't fully sure about — the
 * client only ever reads this value, it can never set it.
 */
export async function getStoryMediaUploadModeAction(
  revisionId: string,
): Promise<"supabase" | "google_drive"> {
  const parsed = uuidSchema.safeParse(revisionId);
  if (!parsed.success) return "supabase";
  const user = await getCurrentUser();
  if (!user) return "supabase";
  return getStoryMediaUploadMode(parsed.data);
}

export type BeginDriveMediaUploadActionResult =
  | { mediaId: string; sessionUri: string }
  | { error: string; code?: "drive_disconnected" };

export async function beginDriveMediaUploadAction(
  revisionId: string,
  sourceMimeType: "image/jpeg" | "image/png" | "image/webp" | "image/heic",
  sizeBytes: number,
): Promise<BeginDriveMediaUploadActionResult> {
  const [tErr, tCommon] = await Promise.all([
    getTranslations("actionErrors"),
    getTranslations("common"),
  ]);
  const user = await getCurrentUser();
  if (!user) return { error: tCommon("mustBeSignedIn") };

  const parsedRevisionId = uuidSchema.safeParse(revisionId);
  if (!parsedRevisionId.success) return { error: tErr("invalidRevision") };
  const parsedMime = mimeSchema.safeParse(sourceMimeType);
  if (!parsedMime.success) return { error: tErr("invalidMedia") };
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return { error: tErr("invalidMedia") };
  }

  try {
    return await beginDriveMediaUpload(
      parsedRevisionId.data,
      parsedMime.data,
      sizeBytes,
    );
  } catch (error) {
    if (error instanceof DriveConnectionError) {
      return { error: tErr("driveDisconnected"), code: "drive_disconnected" };
    }
    return { error: getErrorMessage(error, tErr("reserveUploadFailed")) };
  }
}

export type FinalizeDriveMediaUploadActionResult =
  | { mediaId: string; version: number | null }
  | { error: string; code?: "drive_disconnected" };

export async function finalizeDriveMediaUploadAction(
  mediaId: string,
  expectedVersion: number,
  driveFileId: string,
): Promise<FinalizeDriveMediaUploadActionResult> {
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
  if (typeof driveFileId !== "string" || driveFileId.length === 0) {
    return { error: tErr("invalidMedia") };
  }

  try {
    await finalizeDriveMediaUpload(
      parsedMediaId.data,
      expectedVersion,
      driveFileId,
    );
  } catch (error) {
    if (error instanceof DriveConnectionError) {
      return { error: tErr("driveDisconnected"), code: "drive_disconnected" };
    }
    if (error instanceof DriveFinalizeRejectedError) {
      return { error: tErr("finalizeUploadFailed") };
    }
    return { error: getErrorMessage(error, tErr("finalizeUploadFailed")) };
  }

  // Mirrors finalizeMediaUploadAction's own contract: the server's own
  // post-bump version, read via the existing story-version-for-media
  // lookup (lib/story/mutations.ts) — not an assumed "+1". finalizeDriveMediaUpload
  // has no "stale version, retry against the current one" recovery path
  // the way finalizeStoryMediaUpload's caller does (a forged/expired Drive
  // reservation fails closed, never retries), so this just reads the
  // post-call version, tolerating a lookup failure as null — the caller
  // treats that as "leave my counter alone", same as the Supabase path.
  const version = await storyVersionForMedia(parsedMediaId.data).catch(
    () => null,
  );
  return { mediaId: parsedMediaId.data, version };
}
