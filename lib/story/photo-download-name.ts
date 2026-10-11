/**
 * The file name a downloaded photo is saved under, the same for both
 * storage backends (My Photos, docs/google-drive-integration.md section 7).
 * Built only from server-known values -- the media id and the recorded
 * processed MIME type -- so nothing a user typed (a story title, a caption)
 * ever reaches a Content-Disposition header.
 */
export function photoDownloadFilename(
  mediaId: string,
  processedMimeType: string | null | undefined,
): string {
  const ext = processedMimeType === "image/png" ? "png" : "jpg";
  const shortId = mediaId.replace(/[^0-9a-f]/gi, "").slice(0, 8) || "photo";
  return `kakinotes-photo-${shortId}.${ext}`;
}
