import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PartOfStory, SubStoryList } from "./story-family";
import type { StoryCardData } from "./story-card";

describe("PartOfStory", () => {
  it("links to the main story inside a labelled nav", () => {
    render(<PartOfStory parent={{ slug: "food-queenstown", title: "Food" }} />);
    expect(
      screen.getByRole("navigation", { name: /part of a larger story/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Food" })).toHaveAttribute(
      "href",
      "/stories/food-queenstown",
    );
  });

  it("renders nothing without a parent", () => {
    const { container } = render(<PartOfStory parent={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

const card: StoryCardData = {
  story_id: "00000000-0000-4000-8000-000000000001",
  slug: "fergburger",
  title: "Fergburger",
  excerpt: "Worth the queue",
  published_at: "2026-09-01T00:00:00Z",
  trip_year: 2026,
  travel_style: null,
  total_expense_nzd_cents: null,
  attribution_value: "Kai",
  contributor_slug: "kai",
  contributor_avatar_emoji: null,
  cover_image_path: null,
  regions: [],
  tags: [],
};

describe("SubStoryList", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("shows each sub story as a small card: linked title plus its cover photo", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    const { container } = render(
      <SubStoryList
        cards={[{ ...card, cover_image_path: "covers/fergburger.webp" }]}
        subStories={[]}
      />,
    );
    expect(
      screen.getByRole("heading", { level: 2, name: /more in this story/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Fergburger" })).toHaveAttribute(
      "href",
      "/stories/fergburger",
    );
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toContain("covers/fergburger.webp");
    // Decorative: the title next to it already says what it is.
    expect(img).toHaveAttribute("alt", "");
  });

  it("keeps it small: no excerpt, author or tags", () => {
    render(<SubStoryList cards={[card]} subStories={[]} />);
    expect(screen.queryByText("Worth the queue")).not.toBeInTheDocument();
    expect(screen.queryByText("Kai")).not.toBeInTheDocument();
  });

  it("shows sub stories without a card row the same way, with the placeholder image", () => {
    render(
      <SubStoryList
        cards={[card]}
        subStories={[{ slug: "pie-place", title: "Pie place" }]}
      />,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Pie place" })).toHaveAttribute(
      "href",
      "/stories/pie-place",
    );
  });

  it("renders titles as text, not markup", () => {
    render(<SubStoryList subStories={[{ slug: "x", title: "<b>bold</b>" }]} />);
    expect(
      screen.getByRole("link", { name: "<b>bold</b>" }),
    ).toBeInTheDocument();
  });

  it("renders nothing when empty", () => {
    const { container } = render(<SubStoryList subStories={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
