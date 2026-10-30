import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { JourneyListView } from "./journey-list";
import type { MyJourneyEntry } from "@/lib/journey/contributor-journey";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/my-stories/journey",
}));

function entry(
  id: string,
  title: string,
  extra: Partial<MyJourneyEntry> = {},
): MyJourneyEntry {
  return {
    id,
    slug: title.toLowerCase().replace(/\s+/g, "-"),
    title,
    lifecycleStatus: "published",
    pinnable: true,
    isNewZealand: true,
    parentStoryId: null,
    place: null,
    ...extra,
  };
}

const main = entry("m1", "South Island", {
  place: { label: "Queenstown", latitude: -45.03, longitude: 168.66 },
});
const sub = entry("s1", "Arrowtown autumn", { parentStoryId: "m1" });
const draft = entry("d1", "Untitled story", {
  lifecycleStatus: "draft",
  pinnable: false,
});
const draftSub = entry("d2", "Draft sub", {
  lifecycleStatus: "draft",
  pinnable: false,
  parentStoryId: "m1",
});

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
});

describe("JourneyListView", () => {
  it("lists each published main story with its sub stories, linking to its journey", () => {
    render(<JourneyListView stories={[main, sub, draft, draftSub]} />);
    const list = screen.getByRole("list", { name: "Your stories" });
    const card = within(list).getByRole("link", { name: /South Island/ });
    expect(card).toHaveAttribute("href", "/my-stories/journey/m1");
    expect(within(card).getByText("Arrowtown autumn")).toBeInTheDocument();
    expect(within(card).getByText("1 of 2 on the map")).toBeInTheDocument();
  });

  it("never shows drafts", () => {
    render(<JourneyListView stories={[main, sub, draft, draftSub]} />);
    expect(screen.queryByText("Untitled story")).toBeNull();
    expect(screen.queryByText("Draft sub")).toBeNull();
  });

  it("previews the whole journey as readers see it", () => {
    render(<JourneyListView stories={[main, sub]} />);
    expect(
      screen.getByRole("heading", { name: /how readers will see it/i }),
    ).toBeInTheDocument();
  });

  it("has an empty state when nothing is published", () => {
    render(<JourneyListView stories={[draft]} />);
    expect(
      screen.getByText(/publish a new zealand story to start/i),
    ).toBeInTheDocument();
  });
});
