import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// The story page's lists: related stories are one-cover cards in a swiping
// row, a sub story -- however it was found -- is never repeated under
// "Related stories", and tags past five fold behind a "+N" pill. Data readers
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
    total_expense_nzd_cents: null,
    expenses: [],
    attribution_value: "Mun",
    contributor_slug: null,
    contributor_avatar_emoji: null,
    cover_image_path: null,
    content_json: [],
    regions: [{ region_name: "Otago", destination_name: "Queenstown" }],
    tags: [] as string[],
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
    .closest("section")!;
}

describe("Story page card lists", () => {
  // 2026-11-27 story page redesign: related stories became a row that
  // swipes sideways on a phone, so a card inside it shows one cover and
  // never a photo swiper of its own (two sideways swipes fight each other).
  it("shows related stories as one-cover cards in a swiping row", async () => {
    render(await StoryDetail({ country: "new-zealand", slug: main.slug }));

    const related = relatedSection();
    expect(related).toHaveAttribute("id", "related");
    expect(related.querySelectorAll('a[tabindex="-1"]')).toHaveLength(0);
    expect(
      within(related).getByRole("link", { name: "Wanaka Tree" }),
    ).toHaveAttribute("href", "/stories/wanaka-tree");
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

  // Engineering Rule 17: every public story carries the "personal
  // experience, not advice" label. Since 2026-11-15 it sits at the end of
  // the story rather than above the title -- still always there.
  it("still carries the not-advice label, after the story rather than above the title", async () => {
    render(await StoryDetail({ country: "new-zealand", slug: main.slug }));

    const label = screen.getByText(/One person.s experience/);
    const title = screen.getByRole("heading", {
      level: 1,
      name: "Queenstown Spots",
    });
    expect(
      title.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  // 2026-11-27: nothing above the story swipes sideways. Tags wrap, and
  // past five the rest wait behind a "+N" pill.
  it("folds tags past five behind a +N pill", async () => {
    main.tags = ["a", "b", "c", "d", "e", "f", "g"];
    try {
      render(await StoryDetail({ country: "new-zealand", slug: main.slug }));
      const pill = screen.getByText("+3");
      expect(pill.closest("summary")).toHaveAttribute(
        "aria-label",
        "Show 3 more tags",
      );
      // Region label + a..d shown; e, f, g hidden until it opens.
      expect(screen.getByText("d").closest("li")).not.toHaveClass("hidden");
      expect(screen.getByText("e").closest("li")).toHaveClass("hidden");
    } finally {
      main.tags = [];
    }
  });
});
