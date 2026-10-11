import { describe, expect, it } from "vitest";
import { photoDownloadFilename } from "@/lib/story/photo-download-name";

describe("photoDownloadFilename", () => {
  it("names a JPEG and a PNG by the media id's first 8 hex characters", () => {
    const id = "37cd5afe-6b32-444b-a27f-0f97d121f469";
    expect(photoDownloadFilename(id, "image/jpeg")).toBe(
      "kakinotes-photo-37cd5afe.jpg",
    );
    expect(photoDownloadFilename(id, "image/png")).toBe(
      "kakinotes-photo-37cd5afe.png",
    );
  });

  it("falls back to .jpg for an unknown type", () => {
    expect(photoDownloadFilename("abcdef12-0000", null)).toBe(
      "kakinotes-photo-abcdef12.jpg",
    );
  });

  it("never lets anything but hex through, so the header can't be broken", () => {
    expect(photoDownloadFilename('a"b\r\nc;=../', "image/jpeg")).toBe(
      "kakinotes-photo-abc.jpg",
    );
    expect(photoDownloadFilename("---", "image/jpeg")).toBe(
      "kakinotes-photo-photo.jpg",
    );
  });
});
