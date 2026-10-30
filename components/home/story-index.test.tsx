import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { StoryIndex } from "@/components/home/story-index";
import type { StoryCardData } from "@/components/story/story-card";

function makeStory(overrides: Partial<StoryCardData> = {}): StoryCardData {
  return {
    story_id: "story-1",
    slug: "a-vineyard-season",
    title: "A vineyard season in Marlborough",
    excerpt: "Six weeks of pruning turned into the whole season.",
    published_at: "2026-01-01T00:00:00Z",
    trip_year: 2025,
    travel_style: "solo",
    total_expense_nzd_cents: null,
    attribution_value: "M. Lindqvist",
    contributor_slug: "m-lindqvist",
    contributor_avatar_emoji: null,
    cover_image_path: null,
    cover_media_id: "11111111-1111-4111-8111-111111111111",
    cover_storage_backend: "google_drive",
    regions: [{ region_name: "Marlborough", destination_name: "Blenheim" }],
    tags: ["Viticulture"],
    ...overrides,
  };
}

beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});

describe("StoryIndex covers", () => {
  it("shows each story's cover, on phones too", () => {
    const { container } = render(<StoryIndex stories={[makeStory()]} />);
    const row = screen
      .getByRole("heading", { name: "A vineyard season in Marlborough" })
      .closest("li")!;
    const img = row.querySelector("img")!;
    expect(img).toHaveAttribute(
      "src",
      "/media/11111111-1111-4111-8111-111111111111",
    );
    // The cover's frame used to be `hidden md:block`, so phones never saw
    // (or even loaded) it. Nothing on its way up may hide it now.
    for (
      let el: Element | null = img;
      el && el !== container;
      el = el.parentElement
    ) {
      expect(el.className.toString()).not.toMatch(/(^|\s)hidden(\s|$)/);
    }
  });

  it("shows the sketch placeholder when a story has no cover", () => {
    render(
      <StoryIndex
        stories={[
          makeStory({ cover_media_id: null, cover_storage_backend: null }),
        ]}
      />,
    );
    const row = screen
      .getByRole("heading", { name: "A vineyard season in Marlborough" })
      .closest("li")!;
    expect(row.querySelector("img")!.getAttribute("src")).toContain(
      "NoImage.png",
    );
  });
});
