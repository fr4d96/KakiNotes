import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// The profile's story cards swipe through each story's published photos,
// like the home page and the Stories tab. Data readers are stubbed: this
// checks the page hands each card its own photos, not the queries.
vi.mock("@/lib/story/public-queries", () => ({
  getPublicContributorDeduped: vi.fn(async () => ({
    contributor_id: "c-1",
    display_name: "Aiman R.",
    avatar_emoji: "🛶",
    bio: "",
    home_country_code: "MY",
    public_slug: "aiman-r",
    published_story_count: 2,
    regions: [],
    tags: [],
    trip_years: [],
  })),
  listContributorPublishedStories: vi.fn(async () => [
    {
      story_id: "s-1",
      slug: "story-one",
      title: "Six months picking fruit in Central Otago",
      excerpt: null,
      published_at: "2025-01-01T00:00:00.000Z",
      trip_year: 2024,
      travel_style: null,
      total_expense_nzd_cents: null,
      attribution_value: "Aiman R.",
      contributor_slug: "aiman-r",
      contributor_avatar_emoji: null,
      cover_image_path: null,
      regions: [],
      tags: [],
    },
    {
      story_id: "s-2",
      slug: "story-two",
      title: "A winter on the Canterbury dairy run",
      excerpt: null,
      published_at: "2024-06-01T00:00:00.000Z",
      trip_year: 2023,
      travel_style: null,
      total_expense_nzd_cents: null,
      attribution_value: "Aiman R.",
      contributor_slug: "aiman-r",
      contributor_avatar_emoji: null,
      cover_image_path: null,
      regions: [],
      tags: [],
    },
  ]),
  listCardPhotoUrlsCached: vi.fn(async (storyId: string) =>
    storyId === "s-1"
      ? ["https://cdn.test/a.jpg", "https://cdn.test/b.jpg"]
      : [],
  ),
}));
vi.mock("@/lib/story/journey-queries", () => ({
  getPublishedContributorJourney: vi.fn(async () => []),
}));

import ContributorPage from "./page";

describe("Contributor profile page", () => {
  it("lets each story card swipe through that story's published photos", async () => {
    const { container } = render(
      await ContributorPage({ params: Promise.resolve({ slug: "aiman-r" }) }),
    );

    expect(
      screen.getByRole("link", {
        name: "Six months picking fruit in Central Otago",
      }),
    ).toBeInTheDocument();

    const photoLinks = [
      ...container.querySelectorAll<HTMLAnchorElement>('a[tabindex="-1"]'),
    ];
    expect(photoLinks).toHaveLength(2);
    expect(
      photoLinks.map((a) => a.querySelector("img")?.getAttribute("src")),
    ).toEqual(["https://cdn.test/a.jpg", "https://cdn.test/b.jpg"]);
    for (const a of photoLinks) {
      expect(a).toHaveAttribute("href", "/stories/story-one");
    }
  });
});
