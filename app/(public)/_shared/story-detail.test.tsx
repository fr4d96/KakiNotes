import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// The story page's card lists: related stories swipe through their
// published photos like every other story card, and a sub story -- however
// it was found -- is never repeated under "Related stories". Data readers
// are stubbed; heavy children that don't matter here render nothing.

function storyRow(id: string, slug: string, title: string) {
  return {
    story_id: id,
    slug,
    title,
    excerpt: null,
    published_at: "2026-01-01T00:00:00.000Z",
    trip_year: 2025,
    trip_start_date: null,
    trip_end_date: null,
    travel_style: null,
    total_expense_nzd_cents: null,
    expenses: [],
    attribution_value: "Mun",
    contributor_slug: null,
    contributor_avatar_emoji: null,
    cover_image_path: null,
    content_json: [],
    regions: [{ region_name: "Otago", destination_name: "Queenstown" }],
    tags: [],
  };
}

const main = storyRow("main-id", "queenstown-spots", "Queenstown Spots");
const sub = storyRow("sub-id", "hill-walk", "Hill Walk");
const other = storyRow("other-id", "wanaka-tree", "Wanaka Tree");

vi.mock("@/lib/story/public-queries", () => ({
  getPublishedStoryBySlugDeduped: vi.fn(async (slug: string) =>
    slug === main.slug ? main : slug === sub.slug ? sub : null,
  ),
  getPublishedStoryMediaDeduped: vi.fn(async () => []),
  getPublicContributorDeduped: vi.fn(async () => null),
  coverOf: vi.fn(() => null),
  // Related stories: the sub story comes back too, and must be dropped.
  listPublishedStories: vi.fn(async () => [sub, other]),
  listPublicRegions: vi.fn(async () => []),
  listCardPhotoUrlsCached: vi.fn(async (storyId: string) =>
    storyId === "other-id"
      ? ["https://cdn.test/w1.jpg", "https://cdn.test/w2.jpg"]
      : storyId === "sub-id"
        ? ["https://cdn.test/hill.jpg"]
        : [],
  ),
}));
vi.mock("@/lib/story/story-folders", () => ({
  getPublishedStoryFamilyDeduped: vi.fn(async () => ({
    parent: null,
    subStories: [{ slug: "hill-walk", title: "Hill Walk" }],
  })),
  matchStoryFamilyCards: (links: unknown[]) => ({
    cards: [],
    unmatched: links,
  }),
}));
vi.mock("@/lib/story/journey-queries", () => ({
  getPublishedContributorJourney: vi.fn(async () => []),
}));
vi.mock("@/components/story/content-block-renderer", () => ({
  ContentBlockRenderer: () => null,
}));
vi.mock("@/components/story/story-gallery", () => ({
  StoryGallery: () => null,
}));
vi.mock("@/components/story/report-story-form", () => ({
  ReportStoryForm: () => null,
}));
vi.mock("@/components/story/public-expenses", () => ({
  PublicExpenses: () => null,
}));

import { StoryDetail } from "./story-detail";

function relatedSection() {
  return screen
    .getByRole("heading", { level: 2, name: "Related stories" })
    .closest("div")!;
}

describe("Story page card lists", () => {
  it("lets related story cards swipe through their published photos", async () => {
    render(await StoryDetail({ country: "new-zealand", slug: main.slug }));

    const related = relatedSection();
    const photoLinks = [
      ...related.querySelectorAll<HTMLAnchorElement>('a[tabindex="-1"]'),
    ];
    expect(
      photoLinks.map((a) => a.querySelector("img")?.getAttribute("src")),
    ).toEqual(["https://cdn.test/w1.jpg", "https://cdn.test/w2.jpg"]);
    for (const a of photoLinks) {
      expect(a).toHaveAttribute("href", "/stories/wanaka-tree");
    }
  });

  it("never repeats a sub story found by slug under Related stories", async () => {
    render(await StoryDetail({ country: "new-zealand", slug: main.slug }));

    const subSection = screen
      .getByRole("heading", { level: 2, name: "Sub stories" })
      .closest("section")!;
    expect(
      within(subSection).getByRole("link", { name: "Hill Walk" }),
    ).toBeInTheDocument();
    expect(
      within(relatedSection()).queryByRole("link", { name: "Hill Walk" }),
    ).not.toBeInTheDocument();
    expect(
      within(relatedSection()).getByRole("link", { name: "Wanaka Tree" }),
    ).toBeInTheDocument();
  });
});
