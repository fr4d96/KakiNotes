// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const publicRpc = vi.fn();
const sessionRpc = vi.fn();

vi.mock("@/lib/supabase/public", () => ({
  createPublicClient: () => ({ rpc: publicRpc }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: sessionRpc }),
}));

const {
  getPublishedStoryFamily,
  getStoryParentStory,
  listParentStoryOptions,
  matchSubStoryCards,
} = await import("@/lib/story/sub-stories");

beforeEach(() => {
  publicRpc.mockReset();
  sessionRpc.mockReset();
});

describe("getPublishedStoryFamily", () => {
  it("returns the main story and sub stories from the public RPC", async () => {
    publicRpc.mockResolvedValue({
      data: [
        {
          parent: { slug: "food-in-queenstown", title: "Food in Queenstown" },
          sub_stories: [
            {
              slug: "fergburger",
              title: "Fergburger",
              excerpt: "Worth the queue.",
            },
            { slug: "cookie-time", title: "Cookie Time", excerpt: null },
          ],
        },
      ],
      error: null,
    });

    const family = await getPublishedStoryFamily("fergburger");

    expect(publicRpc).toHaveBeenCalledWith("get_published_story_family", {
      p_slug: "fergburger",
    });
    expect(family.parent).toEqual({
      slug: "food-in-queenstown",
      title: "Food in Queenstown",
    });
    expect(family.subStories.map((s) => s.slug)).toEqual([
      "fergburger",
      "cookie-time",
    ]);
  });

  it("is empty when the story is not public (the RPC returns no row)", async () => {
    publicRpc.mockResolvedValue({ data: [], error: null });
    await expect(getPublishedStoryFamily("a-draft")).resolves.toEqual({
      parent: null,
      subStories: [],
    });
  });

  it("drops a malformed payload rather than rendering it", async () => {
    publicRpc.mockResolvedValue({
      data: [{ parent: { slug: 1 }, sub_stories: "nope" }],
      error: null,
    });
    await expect(getPublishedStoryFamily("x")).resolves.toEqual({
      parent: null,
      subStories: [],
    });
  });

  it("throws on an RPC error", async () => {
    publicRpc.mockResolvedValue({ data: null, error: new Error("boom") });
    await expect(getPublishedStoryFamily("x")).rejects.toThrow("boom");
  });
});

describe("getStoryParentStory", () => {
  it("maps a linked story and calls the owner-only RPC", async () => {
    sessionRpc.mockResolvedValue({
      data: [
        {
          parent_story_id: "p1",
          parent_title: "Food in Queenstown",
          parent_slug: "food-in-queenstown",
          has_sub_stories: false,
        },
      ],
      error: null,
    });
    await expect(getStoryParentStory("s1")).resolves.toEqual({
      parent: {
        storyId: "p1",
        title: "Food in Queenstown",
        slug: "food-in-queenstown",
      },
      hasSubStories: false,
    });
    expect(sessionRpc).toHaveBeenCalledWith("get_story_parent_story", {
      p_story_id: "s1",
    });
  });

  it("returns no parent when the SQL columns are null", async () => {
    sessionRpc.mockResolvedValue({
      data: [
        {
          parent_story_id: null,
          parent_title: null,
          parent_slug: null,
          has_sub_stories: true,
        },
      ],
      error: null,
    });
    await expect(getStoryParentStory("s1")).resolves.toEqual({
      parent: null,
      hasSubStories: true,
    });
  });
});

describe("listParentStoryOptions", () => {
  it("maps rows to camelCase options", async () => {
    sessionRpc.mockResolvedValue({
      data: [{ story_id: "p1", title: "Food in Queenstown", slug: "food" }],
      error: null,
    });
    await expect(listParentStoryOptions("s1")).resolves.toEqual([
      { storyId: "p1", title: "Food in Queenstown", slug: "food" },
    ]);
    expect(sessionRpc).toHaveBeenCalledWith("list_parent_story_options", {
      p_story_id: "s1",
    });
  });
});

describe("matchSubStoryCards", () => {
  it("keeps the family's order and returns sub stories with no card row", () => {
    const result = matchSubStoryCards(
      [
        { slug: "b", title: "B" },
        { slug: "missing", title: "Missing" },
        { slug: "a", title: "A" },
      ],
      [
        { slug: "a", story_id: "1" },
        { slug: "b", story_id: "2" },
        { slug: "not-a-sub-story", story_id: "3" },
      ],
    );
    expect(result.cards.map((c) => c.slug)).toEqual(["b", "a"]);
    expect(result.unmatched).toEqual([{ slug: "missing", title: "Missing" }]);
  });

  it("never adds a card the family read didn't return", () => {
    const result = matchSubStoryCards([], [{ slug: "x", story_id: "1" }]);
    expect(result).toEqual({ cards: [], unmatched: [] });
  });
});
