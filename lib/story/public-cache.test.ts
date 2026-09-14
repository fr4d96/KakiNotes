import { describe, expect, it, vi, beforeEach } from "vitest";

const revalidatePath = vi.fn();
const revalidateTag = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (p: string) => revalidatePath(p),
  revalidateTag: (tag: string, profile: unknown) => revalidateTag(tag, profile),
}));
vi.mock("server-only", () => ({}));
// Only the two tag constants are needed; the rest of public-queries builds
// Supabase clients and is not under test here.
vi.mock("@/lib/story/public-queries", () => ({
  PUBLIC_STORIES_TAG: "public-stories",
  PUBLIC_CONTRIBUTORS_TAG: "public-contributors",
}));

import {
  invalidateStoryPublicCache,
  invalidateStoryListingsPublicCache,
  invalidateContributorPublicCache,
} from "./public-cache";

function paths() {
  return revalidatePath.mock.calls.map((call) => call[0] as string);
}

function tags() {
  return revalidateTag.mock.calls.map((call) => call[0] as string);
}

beforeEach(() => {
  revalidatePath.mockClear();
  revalidateTag.mockClear();
});

describe("data-cache tags", () => {
  // Since 2026-09-14 the public pages cache their DATA (unstable_cache)
  // rather than their HTML, so a visibility change must expire the tagged
  // entries too -- and expire them NOW ({ expire: 0 }), never
  // stale-while-revalidate: a taken-down story is gone this request, not
  // after one more visitor sees it (Engineering Rule 12).
  it("expires the stories tag immediately on any story visibility change", () => {
    invalidateStoryListingsPublicCache();
    expect(tags()).toEqual(["public-stories"]);
    expect(revalidateTag).toHaveBeenCalledWith("public-stories", {
      expire: 0,
    });
  });

  it("expires the contributors tag immediately on a profile change", () => {
    invalidateContributorPublicCache("kaki");
    expect(tags()).toEqual(["public-contributors"]);
    expect(revalidateTag).toHaveBeenCalledWith("public-contributors", {
      expire: 0,
    });
  });
});

describe("invalidateStoryListingsPublicCache", () => {
  // Every public surface that can keep advertising a story whose visibility
  // just changed, minus the one path that needs a slug. Callable when the
  // slug cannot be re-derived server-side, which is the whole point of it
  // existing separately (Engineering Rule 12 -- archived content must not
  // linger in listings or the sitemap).
  it("purges the listing surfaces and the sitemap", () => {
    invalidateStoryListingsPublicCache();
    expect(paths()).toEqual(["/stories", "/", "/sitemap.xml"]);
  });

  it("never touches a slug-specific path", () => {
    invalidateStoryListingsPublicCache();
    expect(paths().some((p) => p.startsWith("/stories/"))).toBe(false);
  });
});

describe("invalidateStoryPublicCache", () => {
  it("purges the detail page as well as everything the listings variant does", () => {
    invalidateStoryPublicCache("a-year-in-otago");
    expect(paths()).toEqual([
      "/stories/a-year-in-otago",
      "/stories",
      "/",
      "/sitemap.xml",
    ]);
  });

  it("is a strict superset of the listings variant", () => {
    invalidateStoryPublicCache("a-year-in-otago");
    const full = paths();
    revalidatePath.mockClear();
    invalidateStoryListingsPublicCache();
    for (const path of paths()) {
      expect(full).toContain(path);
    }
  });
});

describe("invalidateContributorPublicCache", () => {
  it("purges the contributor detail page, the index and the sitemap", () => {
    invalidateContributorPublicCache("mei-ling");
    expect(paths()).toEqual([
      "/contributors/mei-ling",
      "/contributors",
      "/sitemap.xml",
    ]);
  });
});
