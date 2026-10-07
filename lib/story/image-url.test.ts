import { describe, expect, it } from "vitest";
import { getImageUrl, getCardCoverUrl } from "@/lib/story/image-url";
import { getPublicImageUrl } from "@/lib/story/public-image-url";

describe("getImageUrl", () => {
  it("returns byte-identical output to today's direct getPublicImageUrl() call for a supabase row", () => {
    const path = "story-1/media-1/processed-abc123.jpg";
    const media = {
      id: "media-1",
      storage_backend: "supabase" as const,
      public_url: path,
    };
    expect(getImageUrl(media)).toBe(getPublicImageUrl(path));
  });

  it("returns null for a supabase row with no public_url, same as getPublicImageUrl(null)", () => {
    const media = {
      id: "media-1",
      storage_backend: "supabase" as const,
      public_url: null,
    };
    expect(getImageUrl(media)).toBe(getPublicImageUrl(null));
    expect(getImageUrl(media)).toBeNull();
  });

  it("returns the proxy path for a google_drive row, never a Drive URL", () => {
    const media = {
      id: "media-42",
      storage_backend: "google_drive" as const,
      public_url: null,
    };
    expect(getImageUrl(media)).toBe("/media/media-42");
  });

  it("ignores public_url entirely for a google_drive row", () => {
    const media = {
      id: "media-42",
      storage_backend: "google_drive" as const,
      public_url: "story-1/media-1/processed-abc123.jpg",
    };
    expect(getImageUrl(media)).toBe("/media/media-42");
  });
});

describe("getCardCoverUrl", () => {
  it("returns byte-identical output to today's getPublicImageUrl(cover_image_path) when the new columns are absent (every pre-round-B fixture)", () => {
    const path = "story-1/media-1/processed-abc123.jpg";
    const story = { cover_image_path: path };
    expect(getCardCoverUrl(story)).toBe(getPublicImageUrl(path));
  });

  it("returns the same thing when cover_storage_backend is explicitly 'supabase'", () => {
    const path = "story-1/media-1/processed-abc123.jpg";
    const story = {
      cover_image_path: path,
      cover_media_id: "media-1",
      cover_storage_backend: "supabase",
    };
    expect(getCardCoverUrl(story)).toBe(getPublicImageUrl(path));
  });

  it("returns the proxy path for a google_drive cover, never a Drive URL", () => {
    const story = {
      cover_image_path: null,
      cover_media_id: "media-99",
      cover_storage_backend: "google_drive",
    };
    expect(getCardCoverUrl(story)).toBe("/media/media-99");
  });

  it("falls back to null when there's no cover at all", () => {
    expect(getCardCoverUrl({ cover_image_path: null })).toBeNull();
  });
});
