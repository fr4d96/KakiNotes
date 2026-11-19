import { beforeEach, describe, expect, it, vi } from "vitest";

// Story folders shows only the stories of the country chosen in the top
// bar (the kakinotes-country cookie; New Zealand when none), like My
// Stories. Data readers are stubbed: this checks what the view is handed.
const cookieValue = vi.hoisted(() => ({
  current: undefined as string | undefined,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () =>
      cookieValue.current === undefined
        ? undefined
        : { value: cookieValue.current },
  }),
}));
vi.mock("@/lib/story/story-folders", () => ({
  getMyStoryFolders: vi.fn(async () => [
    { id: "nz-1", title: "Queenstown" },
    { id: "nz-2", title: "Auckland" },
    { id: "cn-1", title: "Guangzhou" },
  ]),
}));
vi.mock("@/lib/story/contributor-queries", () => ({
  listMyStories: vi.fn(async () => [
    {
      id: "nz-1",
      country_slug: "new-zealand",
      updated_at: "2026-11-01T00:00:00Z",
    },
    {
      id: "nz-2",
      country_slug: "new-zealand",
      updated_at: "2026-11-18T00:00:00Z",
      cover_media_id: "cover-nz-2",
      cover_alt_text: "Sky Tower at dusk",
    },
    { id: "cn-1", country_slug: "china" },
  ]),
}));
vi.mock("./story-folders-view", () => ({ StoryFoldersView: () => null }));

import StoryFoldersPage from "./page";

async function shownIds(): Promise<string[]> {
  const tree = await StoryFoldersPage();
  return (tree.props as { stories: { id: string }[] }).stories.map((s) => s.id);
}

describe("Story folders page", () => {
  beforeEach(() => {
    cookieValue.current = undefined;
  });

  it("offers only China's stories when China is chosen", async () => {
    cookieValue.current = "china";
    expect(await shownIds()).toEqual(["cn-1"]);
  });

  it("offers New Zealand's stories when nothing is chosen", async () => {
    expect(await shownIds()).toEqual(["nz-1", "nz-2"]);
  });

  it("hands each story its last-updated time for the picker's order", async () => {
    const tree = await StoryFoldersPage();
    const stories = (
      tree.props as { stories: { id: string; updatedAt: string | null }[] }
    ).stories;
    expect(stories.map((s) => [s.id, s.updatedAt])).toEqual([
      ["nz-1", "2026-11-01T00:00:00Z"],
      ["nz-2", "2026-11-18T00:00:00Z"],
    ]);
  });

  it("hands each story its cover for the mini thumbnail", async () => {
    const tree = await StoryFoldersPage();
    const stories = (
      tree.props as {
        stories: {
          id: string;
          coverMediaId: string | null;
          coverAltText: string | null;
        }[];
      }
    ).stories;
    expect(stories.map((s) => [s.id, s.coverMediaId, s.coverAltText])).toEqual([
      ["nz-1", null, null],
      ["nz-2", "cover-nz-2", "Sky Tower at dusk"],
    ]);
  });
});
