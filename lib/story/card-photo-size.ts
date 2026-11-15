/**
 * The small, card-sized versions of a story's photos (2026-11-15).
 *
 * Story cards (home page, Stories tab, contributor profiles) show each photo
 * in a 4:3 frame a phone-width or less across, but used to download the full
 * 1500x2000 public photo (130-490 KB) for it. The /media proxy now also
 * answers `?w=<width>` with a 4:3, centre-cropped WebP of the SAME approved,
 * metadata-stripped photo -- made on the fly, never stored (so Drive still
 * holds exactly one public derivative per photo, Engineering Rule 14) and
 * cached/purged exactly like the full photo. Measured on live photos at
 * 640px: 65/50/14 KB against 482/328/127 KB.
 *
 * Importable from both Server and Client Components (no server-only).
 */

/** The only widths the proxy will make; anything else is a 404. */
// 640 for small screens, 828 for a 2x phone's full-width card, 1080 for a
// 3x phone's.
export const CARD_PHOTO_WIDTHS = [640, 828, 1080] as const;
export type CardPhotoWidth = (typeof CARD_PHOTO_WIDTHS)[number];

/** The card frame's shape: 4 wide by 3 tall. */
export const CARD_PHOTO_ASPECT = 3 / 4;

/** `?w=` -> a width the proxy makes, or null for anything else. */
export function parseCardPhotoWidth(
  value: string | null,
): CardPhotoWidth | null {
  if (value === null) return null;
  const width = Number(value);
  return (CARD_PHOTO_WIDTHS as readonly number[]).includes(width) &&
    String(width) === value
    ? (width as CardPhotoWidth)
    : null;
}

/**
 * Only /media proxy URLs (Drive-backed photos) have small versions. A
 * Supabase public-bucket URL is passed through unchanged.
 */
function isProxyUrl(url: string): boolean {
  return url.startsWith("/media/") && !url.includes("?");
}

/** One small version's URL, or the original URL when it has none. */
export function cardPhotoSrc(url: string, width: CardPhotoWidth): string {
  return isProxyUrl(url) ? `${url}?w=${width}` : url;
}

/** A srcset offering every small version, or undefined when there are none. */
export function cardPhotoSrcSet(url: string): string | undefined {
  if (!isProxyUrl(url)) return undefined;
  return CARD_PHOTO_WIDTHS.map((w) => `${url}?w=${w} ${w}w`).join(", ");
}
