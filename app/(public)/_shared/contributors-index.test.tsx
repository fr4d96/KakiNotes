import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Each country is its own catalogue (Rule 10/12): the directory asks the
// database for one country's contributors, links every profile and the
// next page inside that country's URL prefix, and shows that country's own
// intro -- "Working Holiday" is a New Zealand term only.
vi.mock("@/lib/story/public-queries", () => ({
  listPublicContributors: vi.fn(async () =>
    Array.from({ length: 24 }, (_, i) => ({
      contributor_id: `c-${i}`,
      public_slug: `person-${i}`,
      display_name: `Person ${i}`,
      bio: null,
      avatar_emoji: null,
      home_country_code: null,
      published_story_count: 1,
      regions: [],
      trip_years: [],
      tags: [],
    })),
  ),
}));

import { listPublicContributors } from "@/lib/story/public-queries";
import { ContributorsIndex } from "./contributors-index";

describe("ContributorsIndex", () => {
  beforeEach(() => vi.mocked(listPublicContributors).mockClear());

  it("lists China's contributors only, linked under /cn", async () => {
    render(
      await ContributorsIndex({
        country: "china",
        searchParams: Promise.resolve({}),
      }),
    );

    expect(listPublicContributors).toHaveBeenCalledWith(
      expect.objectContaining({ countrySlug: "china" }),
    );
    expect(screen.getByRole("link", { name: /Person 0/ })).toHaveAttribute(
      "href",
      "/cn/contributors/person-0",
    );
    expect(
      screen
        .getByRole("link", { name: "Load more contributors" })
        .getAttribute("href"),
    ).toMatch(/^\/cn\/contributors\?/);
    expect(document.body.textContent).not.toMatch(/working holiday/i);
  });

  it("lists New Zealand's contributors on the unprefixed page", async () => {
    render(
      await ContributorsIndex({
        country: "new-zealand",
        searchParams: Promise.resolve({}),
      }),
    );

    expect(listPublicContributors).toHaveBeenCalledWith(
      expect.objectContaining({ countrySlug: "new-zealand" }),
    );
    expect(screen.getByRole("link", { name: /Person 0/ })).toHaveAttribute(
      "href",
      "/contributors/person-0",
    );
  });
});
