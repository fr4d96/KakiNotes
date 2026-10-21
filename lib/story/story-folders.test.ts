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

const { getPublishedStoryFamily, getMyStoryFolders, matchStoryFamilyCards } =
  await import("@/lib/story/story-folders");

beforeEach(() => {
  publicRpc.mockReset();
  sessionRpc.mockReset();
});

describe("getPublishedStoryFamily", () => {
  it("returns the parent and sub stories from the public RPC", async () => {
    publicRpc.mockResolvedValue({
      data: [
        {
          parent: { slug: "kakiman", title: "Kakiman", excerpt: "Trip" },
          sub_stories: [
            { slug: "opotiki-trip", title: "Opotiki Trip", excerpt: null },
          ],
        },
      ],
      error: null,
    });

    const family = await getPublishedStoryFamily("story-1");

    expect(publicRpc).toHaveBeenCalledWith("get_published_story_family", {
      p_story_id: "story-1",
    });
    expect(family.parent?.slug).toBe("kakiman");
    expect(family.subStories.map((s) => s.slug)).toEqual(["opotiki-trip"]);
  });

  it("is empty when the story is not public (the RPC returns no rows)", async () => {
    publicRpc.mockResolvedValue({ data: [], error: null });
    await expect(getPublishedStoryFamily("a-draft")).resolves.toEqual({
      parent: null,
      subStories: [],
    });
  });

  it("drops a malformed parent rather than rendering it", async () => {
    publicRpc.mockResolvedValue({
      data: [{ parent: { slug: 1 }, sub_stories: [] }],
      error: null,
    });
    const family = await getPublishedStoryFamily("x");
    expect(family.parent).toBeNull();
  });

  it("throws on an RPC error", async () => {
    publicRpc.mockResolvedValue({ data: null, error: new Error("boom") });
    await expect(getPublishedStoryFamily("x")).rejects.toThrow("boom");
  });
});

describe("matchStoryFamilyCards", () => {
  it("pairs links with card rows by slug, keeping link order", () => {
    const { cards, unmatched } = matchStoryFamilyCards(
      [
        { slug: "a", title: "A" },
        { slug: "b", title: "B" },
      ],
      [{ slug: "a", title: "A card" }],
    );
    expect(cards).toEqual([{ slug: "a", title: "A card" }]);
    expect(unmatched).toEqual([{ slug: "b", title: "B" }]);
  });
});

describe("getMyStoryFolders", () => {
  it("maps the RPC's snake_case rows to camelCase entries", async () => {
    sessionRpc.mockResolvedValue({
      data: [
        {
          id: "s1",
          slug: "kakiman",
          title: "Kakiman",
          lifecycle_status: "published",
          linkable: true,
          parent_story_id: null,
        },
      ],
      error: null,
    });

    const folders = await getMyStoryFolders();

    expect(sessionRpc).toHaveBeenCalledWith("get_my_story_folders");
    expect(folders).toEqual([
      {
        id: "s1",
        slug: "kakiman",
        title: "Kakiman",
        lifecycleStatus: "published",
        linkable: true,
        parentStoryId: null,
      },
    ]);
  });

  it("throws on an RPC error", async () => {
    sessionRpc.mockResolvedValue({ data: null, error: new Error("boom") });
    await expect(getMyStoryFolders()).rejects.toThrow("boom");
  });
});
