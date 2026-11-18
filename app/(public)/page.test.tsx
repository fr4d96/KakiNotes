import { render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  listCardPhotoUrlsCached,
  listPublicRegions,
  listPublishedStoriesCached,
} from "@/lib/story/public-queries";

vi.mock("@/lib/story/public-queries", () => ({
  listPublishedStoriesCached: vi.fn(async () => []),
  listCardPhotoUrlsCached: vi.fn(async () => []),
  listPublicRegions: vi.fn(async () => []),
  listPublicDestinations: vi.fn(async () => []),
}));

// The country remembered on this device (POST /country). Most tests are a
// reader who already chose New Zealand; the picker and China tests change it.
const countryCookie = vi.hoisted(() => ({
  value: "new-zealand" as string | undefined,
}));
// The shelf tests below are about the "big" swipe row; small cards (the
// default) have their own test at the end.
const cardSizeCookie = vi.hoisted(() => ({
  value: "big" as string | undefined,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "kakinotes-country" && countryCookie.value
        ? { name, value: countryCookie.value }
        : name === "kakinotes-card-size" && cardSizeCookie.value
          ? { name, value: cardSizeCookie.value }
          : undefined,
  }),
}));
const redirect = vi.hoisted(() =>
  vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
);
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  redirect,
  // The big | small card switch refreshes through the router.
  useRouter: () => ({ refresh: vi.fn() }),
}));

// The browser Supabase client, as useSignedIn() sees it: no session unless
// a test says otherwise (public pages read the session client-side only).
const browserSession = vi.hoisted(() => ({ signedIn: false }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({
        data: {
          session: browserSession.signedIn ? { user: { id: "u-1" } } : null,
        },
      }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
    },
  }),
}));

import HomePage from "./page";
import { resetViewerIdentityForTests } from "@/lib/auth/viewer-identity";

beforeEach(() => {
  // The viewer store is tab-wide; each test starts as a fresh tab.
  resetViewerIdentityForTests();
  countryCookie.value = "new-zealand";
  cardSizeCookie.value = "big";
  redirect.mockClear();
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

  // A sign-up pitch is for visitors: once the browser confirms a session,
  // the contribute panel goes (owner request 2026-11-17).
  it("drops the contribute panel for a signed-in contributor", async () => {
    browserSession.signedIn = true;
    try {
      render(await HomePage());
      await waitFor(() =>
        expect(
          screen.queryByRole("link", { name: /Share your story/ }),
        ).toBeNull(),
      );
    } finally {
      browserSession.signedIn = false;
    }
  });

  // Cards swipe through the story's published photos right on the home
  // page; the photo strip links to the story but stays out of the tab order,
  // so the title link remains each card's one stop.
  it("gives each latest-story card its published photos to swipe through", async () => {
    mockStories(fixtureStory, otherStory);
    vi.mocked(listCardPhotoUrlsCached).mockImplementation(async (storyId) =>
      storyId === fixtureStory.story_id
        ? ["https://cdn.test/a.jpg", "https://cdn.test/b.jpg"]
        : [],
    );

    const { container } = render(await HomePage());

    const latest = sectionByHeading("Latest stories");
    const photoLinks = [
      ...latest.querySelectorAll<HTMLAnchorElement>('a[tabindex="-1"]'),
    ];
    const firstCard = photoLinks.filter(
      (a) => a.getAttribute("href") === "/stories/story-one",
    );
    expect(firstCard).toHaveLength(2);
    expect(
      firstCard.map((a) => a.querySelector("img")?.getAttribute("src")),
    ).toEqual(["https://cdn.test/a.jpg", "https://cdn.test/b.jpg"]);
    for (const link of firstCard) {
      expect(link).toHaveAttribute("aria-hidden", "true");
    }
    expect(container).toBeTruthy();
  });

  // First visit on this device: the country picker opens over the home page
  // (which still renders underneath, for crawlers).
  it("asks for a country on the first visit, over the real home page", async () => {
    countryCookie.value = undefined;
    render(await HomePage());

    const picker = screen.getByRole("dialog", {
      name: "Where are you heading?",
    });
    const nz = within(picker).getByRole("button", { name: /New Zealand/ });
    const china = within(picker).getByRole("button", { name: /China/ });
    expect(nz).toHaveAttribute("value", "new-zealand");
    expect(china).toHaveAttribute("value", "china");
    expect(nz.closest("form")).toHaveAttribute("action", "/country");
    expect(nz.textContent).toContain("🇳🇿");
    expect(china.textContent).toContain("🇨🇳");
    // The home page is still there underneath.
    expect(
      screen.getByRole("heading", { level: 1, name: /Real stories/ }),
    ).toBeInTheDocument();
  });

  it("shows no picker once New Zealand has been chosen", async () => {
    render(await HomePage());
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens China's home for a reader who chose China", async () => {
    countryCookie.value = "china";
    await expect(HomePage()).rejects.toThrow("NEXT_REDIRECT /cn");
    expect(redirect).toHaveBeenCalledWith("/cn");
  });

  it("treats an unknown remembered country as no choice yet", async () => {
    countryCookie.value = "atlantis";
    render(await HomePage());
    expect(
      screen.getByRole("dialog", { name: "Where are you heading?" }),
    ).toBeInTheDocument();
  });

  it("shows latest stories as small cards, two per row, unless the reader chose big", async () => {
    cardSizeCookie.value = undefined;
    mockStories(fixtureStory, otherStory);
    const { container } = render(await HomePage());
    expect(screen.getByRole("button", { name: "Small cards" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(container.querySelector(".grid-cols-2 article")).not.toBeNull();
  });
});
