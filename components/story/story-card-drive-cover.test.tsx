import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StoryCard, type StoryCardData } from "./story-card";

/**
 * Round B coverage for StoryCard's new optional cover_media_id/
 * cover_storage_backend fields (getCardCoverUrl(), lib/story/image-url.ts).
 * Kept in its OWN file, separate from story-card.test.tsx, so that
 * pre-existing file stays byte-for-byte unedited — it must keep passing
 * without any changes, per this task's own rule.
 */
const baseStory: StoryCardData = {
  story_id: "11111111-1111-4111-8111-111111111111",
  slug: "picking-apples-in-hawkes-bay",
  title: "Picking Apples in Hawke's Bay",
  excerpt: "Six weeks on an orchard, from dawn shifts to weekend hikes.",
  published_at: "2024-03-01T00:00:00.000Z",
  trip_year: 2023,
  travel_style: "budget",
  total_expense_nzd_cents: 850000,
  attribution_value: "Mei L.",
  contributor_slug: "mei-l",
  contributor_avatar_emoji: null,
  cover_image_path: null,
  regions: [{ region_name: "Hawke's Bay", destination_name: "Hastings" }],
  tags: ["Fruit picking", "Rural"],
};

describe("StoryCard — google_drive cover (round B)", () => {
  it("renders a google_drive cover via the proxy path, not a storage path", () => {
    const { container } = render(
      <StoryCard
        story={{
          ...baseStory,
          cover_image_path: null,
          cover_media_id: "media-cover-1",
          cover_storage_backend: "google_drive",
        }}
      />,
    );
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", "/media/media-cover-1");
  });

  it("still renders the NoImage placeholder (not a Drive/storage URL) when there's no cover of either backend", () => {
    const { container } = render(<StoryCard story={baseStory} />);
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toContain("NoImage");
  });

  it("renders a supabase cover exactly as before when the new fields are explicitly 'supabase'", () => {
    render(
      <StoryCard
        story={{
          ...baseStory,
          cover_image_path: "story-1/media-1/processed-abc123.jpg",
          cover_media_id: "media-1",
          cover_storage_backend: "supabase",
        }}
      />,
    );
    expect(
      screen.getByRole("link", { name: /picking apples in hawke's bay/i }),
    ).toBeInTheDocument();
  });
});
