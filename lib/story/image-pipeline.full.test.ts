// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/env.server", () => ({
  env: { NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co" },
  getAdminEnv: () => ({ SUPABASE_SERVICE_ROLE_KEY: "test" }),
}));
vi.mock("@/lib/story/raw-storage-http", () => ({
  rawStorageDownload: vi.fn(),
  rawStorageUpload: vi.fn(),
}));

import {
  processFullResolutionBytesInMemory,
  processImageBytesInMemory,
} from "@/lib/story/image-pipeline";

// A photo bigger than the 2000px display cap, carrying camera + GPS EXIF.
async function bigPhotoWithGps(width = 3200, height = 2400) {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: "#808080",
      noise: { type: "gaussian", mean: 128, sigma: 30 },
    },
  })
    .withExif({
      IFD0: { Make: "TestCamera", Model: "Phone 15" },
      IFD3: {
        GPSLatitudeRef: "S",
        GPSLatitude: "36/1 50/1 0/1",
        GPSLongitudeRef: "E",
        GPSLongitude: "174/1 45/1 0/1",
      },
    })
    .jpeg({ quality: 95 })
    .toBuffer();
}

describe("processFullResolutionBytesInMemory", () => {
  it("keeps every pixel while the display copy is capped at 2000px", async () => {
    const input = await bigPhotoWithGps();
    const full = await processFullResolutionBytesInMemory(input);
    const display = await processImageBytesInMemory(input);

    expect([full.width, full.height]).toEqual([3200, 2400]);
    expect(Math.max(display.processedWidth, display.processedHeight)).toBe(
      2000,
    );
    expect(full.mimeType).toBe("image/jpeg");
  });

  it("strips all metadata, GPS included", async () => {
    const input = await bigPhotoWithGps();
    expect((await sharp(input).metadata()).exif).toBeDefined();

    const full = await processFullResolutionBytesInMemory(input);
    const meta = await sharp(full.bytes).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(meta.iptc).toBeUndefined();
    expect(full.bytes.includes(Buffer.from("TestCamera"))).toBe(false);
  });

  it("applies the camera's rotation before dropping it", async () => {
    const portrait = await sharp({
      create: { width: 600, height: 400, channels: 3, background: "#888" },
    })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    const full = await processFullResolutionBytesInMemory(portrait);
    expect([full.width, full.height]).toEqual([400, 600]);
    expect((await sharp(full.bytes).metadata()).orientation).toBeUndefined();
  });

  it("keeps a PNG lossless", async () => {
    const png = await sharp({
      create: { width: 2600, height: 300, channels: 3, background: "#123456" },
    })
      .png()
      .toBuffer();
    const full = await processFullResolutionBytesInMemory(png);
    expect(full.mimeType).toBe("image/png");
    expect(full.width).toBe(2600);
  });

  it("handles an iPhone HEIC at full size", async () => {
    const heic = readFileSync(join(__dirname, "__fixtures__", "sample.heic"));
    const full = await processFullResolutionBytesInMemory(heic);
    const source = await processImageBytesInMemory(heic);
    expect(full.mimeType).toBe("image/jpeg");
    expect([full.width, full.height]).toEqual([
      source.sourceWidth,
      source.sourceHeight,
    ]);
    expect((await sharp(full.bytes).metadata()).exif).toBeUndefined();
  });

  it("rejects what the display pipeline rejects", async () => {
    await expect(
      processFullResolutionBytesInMemory(Buffer.from("not an image")),
    ).rejects.toThrow("unrecognized_image_format");
  });
});
