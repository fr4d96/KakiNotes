import "server-only";
import sharp from "sharp";
import {
  CARD_PHOTO_ASPECT,
  type CardPhotoWidth,
} from "@/lib/story/card-photo-size";

/**
 * Makes the card-sized version of an already approved, already
 * metadata-stripped public photo: centre-cropped to the card's 4:3 frame
 * (the same crop the card's object-cover shows), never enlarged, WebP.
 * sharp writes no metadata unless asked (no withMetadata()), so nothing the
 * pipeline stripped can come back. In memory only; nothing is stored.
 */
export async function resizeForCard(
  bytes: Buffer,
  width: CardPhotoWidth,
): Promise<Buffer> {
  return sharp(bytes)
    .resize({
      width,
      height: Math.round(width * CARD_PHOTO_ASPECT),
      fit: "cover",
      position: "centre",
      withoutEnlargement: true,
    })
    .webp({ quality: 72 })
    .toBuffer();
}
