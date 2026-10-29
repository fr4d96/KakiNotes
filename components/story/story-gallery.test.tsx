import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { StoryGallery } from "./story-gallery";
import { getPublicImageUrl } from "@/lib/story/public-image-url";

describe("StoryGallery", () => {
  beforeEach(() => {
    // getPublicImageUrl() returns null without this -- not set anywhere in
    // the test environment by default.
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  });

  it("renders a supabase image at the exact same URL getPublicImageUrl() would build", () => {
    const path = "story-1/media-1/processed-abc123.jpg";
    render(
      <StoryGallery
        images={[
          {
            media_id: "media-1",
            public_url: path,
            alt_text: "A view of the orchard",
            caption: null,
            decorative: false,
            sort_order: 0,
            is_cover: false,
          },
        ]}
      />,
    );
    const img = screen.getByAltText("A view of the orchard");
    expect(img).toHaveAttribute("src", getPublicImageUrl(path)!);
  });

  it("renders a google_drive image via the proxy path, never a storage path", () => {
    render(
      <StoryGallery
        images={[
          {
            media_id: "media-2",
            public_url: null,
            storage_backend: "google_drive",
            alt_text: "A sunset over the vineyard",
            caption: null,
            decorative: false,
            sort_order: 0,
            is_cover: false,
          },
        ]}
      />,
    );
    const img = screen.getByAltText("A sunset over the vineyard");
    expect(img).toHaveAttribute("src", "/media/media-2");
  });

  it("renders nothing for an image with no resolvable URL at all", () => {
    const { container } = render(
      <StoryGallery
        images={[
          {
            media_id: "media-3",
            public_url: null,
            alt_text: null,
            caption: null,
            decorative: false,
            sort_order: 0,
            is_cover: false,
          },
        ]}
      />,
    );
    expect(container.querySelector("img")).toBeNull();
  });
});
