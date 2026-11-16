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
    { id: "nz-1", country_slug: "new-zealand" },
    { id: "nz-2", country_slug: "new-zealand" },
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
});
