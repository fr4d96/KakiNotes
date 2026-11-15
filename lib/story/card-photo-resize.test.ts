// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";

vi.mock("server-only", () => ({}));

import { resizeForCard } from "./card-photo-resize";

async function photo(width: number, height: number) {
  // A portrait photo carrying EXIF (incl. a GPS-ish comment) to prove the
  // card version drops it.
  return sharp({
    create: { width, height, channels: 3, background: "#4a7" },
  })
    .jpeg()
    .withMetadata({
      exif: { IFD0: { ImageDescription: "GPS 45.0 168.6" } },
    })
    .toBuffer();
}

describe("resizeForCard", () => {
  it("makes a 4:3, centre-cropped WebP at the asked width", async () => {
    const out = await resizeForCard(await photo(1500, 2000), 640);
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(640);
    expect(meta.height).toBe(480);
  });

  it("keeps no metadata", async () => {
    const out = await resizeForCard(await photo(1500, 2000), 1080);
    const meta = await sharp(out).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.icc).toBeUndefined();
  });

  it("never enlarges a small photo", async () => {
    const out = await resizeForCard(await photo(400, 300), 1080);
    const meta = await sharp(out).metadata();
    expect(meta.width).toBeLessThanOrEqual(400);
    expect(meta.height).toBeLessThanOrEqual(300);
  });
});
