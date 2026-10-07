/**
 * Browser-side half of the Drive upload path (docs/google-drive-
 * integration.md section 4, Option D steps 2-3). No "server-only" guard —
 * this runs in the browser, inside components/story/image-upload-
 * manager.tsx's handleFiles(). Kept as its own small module per this
 * round's instructions, rather than threading Drive conditionals through
 * the existing uploader: the non-Drive path in image-upload-manager.tsx is
 * untouched, byte-for-byte, and this module is the ONLY new code path a
 * Drive-mode upload runs through before the queued finalize call (which
 * stays in the component, for the same reason the existing Supabase path's
 * finalize call does — see that component's own comment on why finalize
 * must run inside the shared mutation queue).
 */

export type DriveUploadProgress = { sentBytes: number; totalBytes: number };

// Google's resumable-upload protocol requires each chunk's size to be a
// multiple of 256 KiB (the final chunk excepted). 8 MiB is comfortably
// under both a typical photo's size and any sane per-request memory
// budget, and is itself an exact multiple of 256 KiB (32x).
const CHUNK_SIZE_BYTES = 8 * 1024 * 1024;

function parseRangeUpperBound(rangeHeader: string): number | null {
  // Google's continuation response header shape: "bytes=0-8388607" — the
  // upper bound is what Drive actually has, which can lag behind what we
  // just sent if the connection dropped mid-chunk. Never assume our own
  // chunk landed in full; always resume from what the header says.
  const match = /bytes=\d+-(\d+)/.exec(rangeHeader);
  return match ? Number(match[1]) : null;
}

export class DriveChunkUploadError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "DriveChunkUploadError";
  }
}

/**
 * PUTs `file` to an already-opened Drive resumable session URI, in
 * CHUNK_SIZE_BYTES chunks (a multiple of 256 KiB), using `Content-Range`
 * per chunk and resuming from a 308's `Range` header rather than assuming
 * the prior chunk fully landed. Returns the finished file's Drive id, read
 * from the final 200/201 response body — never trusts a locally-tracked
 * "done" flag over what Drive itself reports.
 *
 * `fetchImpl` is injectable so this is testable with a mocked fetch,
 * without a real network call or a real File object's binary content.
 */
export async function uploadFileToDriveSession(
  sessionUri: string,
  file: Blob,
  onProgress?: (progress: DriveUploadProgress) => void,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const totalBytes = file.size;
  let offset = 0;

  // A zero-byte file would loop forever below (offset never advances past
  // 0..0) — not a real case for an image upload (image-validation.ts's own
  // size floor is implicit via its ceilings), but guarded rather than
  // silently hanging.
  if (totalBytes === 0) {
    throw new DriveChunkUploadError("Cannot upload an empty file");
  }

  while (offset < totalBytes) {
    const end = Math.min(offset + CHUNK_SIZE_BYTES, totalBytes);
    const chunk = file.slice(offset, end);

    const response = await fetchImpl(sessionUri, {
      method: "PUT",
      headers: {
        "Content-Range": `bytes ${offset}-${end - 1}/${totalBytes}`,
        "Content-Length": String(end - offset),
      },
      body: chunk,
    });

    if (response.status === 200 || response.status === 201) {
      onProgress?.({ sentBytes: totalBytes, totalBytes });
      const json = (await response.json().catch(() => null)) as {
        id?: string;
      } | null;
      if (!json?.id) {
        throw new DriveChunkUploadError(
          "Drive upload completed with no file id in the response",
        );
      }
      return json.id;
    }

    if (response.status === 308) {
      const rangeHeader = response.headers.get("Range");
      const confirmedUpperBound = rangeHeader
        ? parseRangeUpperBound(rangeHeader)
        : null;
      // No Range header on a 308 means Drive has received nothing yet —
      // resume from the very start, not from wherever we last thought we
      // were.
      offset = confirmedUpperBound === null ? 0 : confirmedUpperBound + 1;
      onProgress?.({ sentBytes: offset, totalBytes });
      continue;
    }

    throw new DriveChunkUploadError(
      `Drive upload chunk failed (${response.status})`,
      response.status,
    );
  }

  // Unreachable in practice (the loop only exits via an explicit return or
  // throw above), kept as a typed exhaustiveness guard rather than an
  // implicit `undefined` return.
  throw new DriveChunkUploadError(
    "Drive upload loop exited without a final response",
  );
}

export type BeginDriveUploadFn = (
  revisionId: string,
  mimeType: "image/jpeg" | "image/png" | "image/webp" | "image/heic",
  sizeBytes: number,
) => Promise<{ mediaId: string; sessionUri: string } | { error: string }>;

export class DriveUploadBeginError extends Error {}

/**
 * Begins a Drive-mode reservation (the server action, which calls the
 * begin_drive_media_upload RPC + opens the resumable session) and uploads
 * the file's bytes straight to Drive. Deliberately does NOT call finalize
 * — the caller (image-upload-manager.tsx) runs that through its own
 * mutation queue, reading `versionRef.current` at the moment the queued
 * callback actually executes, exactly like the existing Supabase path's
 * finalize call already does. Putting finalize here would mean capturing
 * `expectedVersion` too early, before this function's own (potentially
 * slow, chunked) upload has finished.
 */
export async function beginAndUploadToDrive(
  params: {
    revisionId: string;
    file: Blob;
    mimeType: "image/jpeg" | "image/png" | "image/webp" | "image/heic";
  },
  beginUpload: BeginDriveUploadFn,
  onProgress?: (progress: DriveUploadProgress) => void,
): Promise<{ mediaId: string; driveFileId: string }> {
  const begun = await beginUpload(
    params.revisionId,
    params.mimeType,
    params.file.size,
  );
  if ("error" in begun) {
    throw new DriveUploadBeginError(begun.error);
  }
  const driveFileId = await uploadFileToDriveSession(
    begun.sessionUri,
    params.file,
    onProgress,
  );
  return { mediaId: begun.mediaId, driveFileId };
}
