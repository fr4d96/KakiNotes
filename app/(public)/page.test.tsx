import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  listPublicRegions,
  listPublishedStoriesCached,
} from "@/lib/story/public-queries";

vi.mock("@/lib/story/public-queries", () => ({
  listPublishedStoriesCached: vi.fn(async () => []),
  listPublicRegions: vi.fn(async () => []),
  listPublicDestinations: vi.fn(async () => []),
}));

import HomePage from "./page";

beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
});

const fixtureStory = {
  story_id: "1",
  slug: "story-one",
  title: "Six months picking fruit in Central Otago",
  excerpt: "I landed in Queenstown with no plan.",
  published_at: "2025-01-01T00:00:00.000Z",
  trip_year: 2024,
  travel_style: "backpacker",
  total_expense_nzd_cents: null,
  attribution_type: "display_name",
  attribution_value: "Aiman R.",
  contributor_slug: "aiman-r",
  cover_image_path: null,
  regions: [{ region_name: "Otago", destination_name: "Queenstown" }],
  tags: ["Fruit picking"],
};

const otherStory = {
  ...fixtureStory,
  story_id: "2",
  slug: "story-two",
  title: "A winter on the Canterbury dairy run",
  excerpt: "Up at four, and colder than I expected.",
  trip_year: 2023,
  attribution_value: "Mei L.",
  contributor_slug: "mei-l",
  regions: [{ region_name: "Canterbury", destination_name: "Ashburton" }],
  tags: ["Farm work"],
};

const regionRows = [
  { id: "r-cant", name: "Canterbury", slug: "canterbury", name_zh_cn: null },
  { id: "r-otago", name: "Otago", slug: "otago", name_zh_cn: null },
  { id: "r-west", name: "West Coast", slug: "west-coast", name_zh_cn: null },
];

function mockStories(...batch: unknown[]) {
  vi.mocked(listPublishedStoriesCached).mockResolvedValueOnce(
    batch as unknown as Awaited<ReturnType<typeof listPublishedStoriesCached>>,
  );
}

function sectionByHeading(name: string) {
  return screen
    .getByRole("heading", { level: 2, name })
    .closest("section") as HTMLElement;
}

describe("HomePage", () => {
  // The personal-experience/not-advice disclaimer is asserted separately in
  // components/site-footer.test.tsx -- SiteFooter renders it on the home
  // pages via app/(public)/layout.tsx, which this test (rendering <HomePage />
  // in isolation, not the full layout) never mounts.
  it("renders the platform's hero heading", async () => {
    render(await HomePage());

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /real stories from across aotearoa/i,
      }),
    ).toBeInTheDocument();
  });

  it("offers a search that submits to the stories index", async () => {
    render(await HomePage());

    const search = screen.getByRole("search");
    expect(search).toHaveAttribute("action", "/stories");
    expect(search).toHaveAttribute("method", "get");
    expect(
      within(search).getByRole("searchbox", { name: "Search stories" }),
    ).toHaveAttribute("name", "q");
  });

  it("renders nothing for the story-driven sections when there are no published stories", async () => {
    render(await HomePage());

    expect(
      screen.queryByRole("heading", { name: "Latest stories" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Browse by place" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Not sure where to start?"),
    ).not.toBeInTheDocument();
  });

  it("still explains the model when there are no published stories", async () => {
    render(await HomePage());

    const trust = sectionByHeading("Why you can trust these");
    expect(
      within(trust).getByText("Written by the person who lived it"),
    ).toBeInTheDocument();
    expect(
      within(trust).getByText("Personal experience, not advice"),
    ).toBeInTheDocument();
  });

  it("shelves the latest stories as links to the story pages", async () => {
    mockStories(fixtureStory, otherStory);

    render(await HomePage());

    const latest = sectionByHeading("Latest stories");
    expect(
      within(latest).getByRole("link", {
        name: "Six months picking fruit in Central Otago",
      }),
    ).toHaveAttribute("href", "/stories/story-one");
    expect(
      within(latest).getByRole("link", {
        name: "A winter on the Canterbury dairy run",
      }),
    ).toHaveAttribute("href", "/stories/story-two");
    // Each card shows the record fields it actually has, and its writer.
    expect(within(latest).getByText("Queenstown, Otago · 2024")).toBeVisible();
    expect(within(latest).getByText("Aiman R.")).toBeInTheDocument();
    expect(
      within(latest).getByRole("link", { name: /See all/ }),
    ).toHaveAttribute("href", "/stories");
  });

  it("links each place in the batch into the filtered stories index", async () => {
    vi.mocked(listPublicRegions).mockResolvedValueOnce(regionRows);
    mockStories(fixtureStory, otherStory);

    render(await HomePage());

    const places = sectionByHeading("Browse by place");
    expect(within(places).getByRole("link", { name: "Otago" })).toHaveAttribute(
      "href",
      "/stories?region=r-otago",
    );
    expect(
      within(places).getByRole("link", { name: "Canterbury" }),
    ).toHaveAttribute("href", "/stories?region=r-cant");
    // A region no published story carries is never offered.
    expect(
      within(places).queryByRole("link", { name: "West Coast" }),
    ).not.toBeInTheDocument();
  });

  it("hides the place tiles when the regions lookup has nothing to link to", async () => {
    mockStories(fixtureStory);

    render(await HomePage());

    expect(
      screen.queryByRole("heading", { name: "Browse by place" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the destination quiz collapsed behind one row when stories exist", async () => {
    mockStories(fixtureStory);

    render(await HomePage());

    const summary = screen.getByText("Not sure where to start?");
    const details = summary.closest("details") as HTMLDetailsElement;
    expect(details).toBeInTheDocument();
    expect(details.open).toBe(false);
  });

  it("closes on a single contribute call to action", async () => {
    render(await HomePage());

    expect(
      screen.getByRole("link", { name: /Share your story/ }),
    ).toHaveAttribute("href", "/sign-up");
  });
});
