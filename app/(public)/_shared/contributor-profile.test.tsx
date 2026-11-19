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

import {
  getPublicContributorDeduped,
  listContributorPublishedStories,
} from "@/lib/story/public-queries";
import { getPublishedContributorJourney } from "@/lib/story/journey-queries";
import { ContributorProfile } from "./contributor-profile";

describe("Contributor profile page", () => {
  it("lets each story card swipe through that story's published photos", async () => {
    const { container } = render(
      await ContributorProfile({ country: "new-zealand", slug: "aiman-r" }),
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

  // Each country is its own catalogue (Rule 10/12): a China profile asks
  // for the contributor and their stories in China only, links its cards
  // into /cn, and never asks for the New Zealand-only journey map.
  it("scopes a China profile to China", async () => {
    vi.mocked(getPublicContributorDeduped).mockClear();
    vi.mocked(listContributorPublishedStories).mockClear();
    vi.mocked(getPublishedContributorJourney).mockClear();

    render(await ContributorProfile({ country: "china", slug: "aiman-r" }));

    expect(getPublicContributorDeduped).toHaveBeenCalledWith(
      "aiman-r",
      "china",
    );
    expect(listContributorPublishedStories).toHaveBeenCalledWith(
      "c-1",
      expect.objectContaining({ countrySlug: "china" }),
    );
    expect(getPublishedContributorJourney).not.toHaveBeenCalled();
    expect(
      screen.getByRole("link", {
        name: "Six months picking fruit in Central Otago",
      }),
    ).toHaveAttribute("href", "/cn/stories/story-one");
  });

  it("asks for New Zealand on the New Zealand profile", async () => {
    vi.mocked(getPublicContributorDeduped).mockClear();
    render(
      await ContributorProfile({ country: "new-zealand", slug: "aiman-r" }),
    );
    expect(getPublicContributorDeduped).toHaveBeenCalledWith(
      "aiman-r",
      "new-zealand",
    );
  });
});
