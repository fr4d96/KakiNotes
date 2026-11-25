import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi, beforeEach } from "vitest";

const revalidatePath = vi.fn();
const revalidateTag = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (p: string) => revalidatePath(p),
  revalidateTag: (tag: string, profile: unknown) => revalidateTag(tag, profile),
}));
vi.mock("server-only", () => ({}));
const dangerouslyDeleteByTag = vi.fn<(tag: string) => Promise<void>>(
  async () => {},
);
const waitUntil = vi.fn();
vi.mock("@vercel/functions", () => ({
  dangerouslyDeleteByTag: (tag: string) => dangerouslyDeleteByTag(tag),
  waitUntil: (promise: Promise<unknown>) => waitUntil(promise),
}));
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
  invalidateStoryListingPagesOnly,
  invalidateStoryPagesOnly,
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
  dangerouslyDeleteByTag.mockClear();
  waitUntil.mockClear();
});

describe("data-cache tags", () => {
  // Since 2026-09-14 the public pages cache their DATA (unstable_cache)
  // rather than their HTML, so a visibility change must expire the tagged
  // entries too -- and expire them NOW ({ expire: 0 }), never
  // stale-while-revalidate: a taken-down story is gone this request, not
  // after one more visitor sees it (Engineering Rule 12).
  it("expires the stories tag immediately on any story visibility change", () => {
    invalidateStoryListingsPublicCache();
    expect(tags()).toEqual(["public-stories", "public-media"]);
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
      "/cn/contributors/mei-ling",
      "/cn/contributors",
      "/sitemap.xml",
    ]);
  });
});

// Published photos sit in Vercel's CDN for days (app/media/[mediaId]), so
// every visibility change must drop them at once: Next's tag expiry and
// Vercel's hard CDN delete (never the serve-stale-once invalidate), kept
// alive past the response with waitUntil.
describe("public photo cache purge", () => {
  it.each([
    ["a story's visibility change", () => invalidateStoryPublicCache("s")],
    ["a listings-only change", () => invalidateStoryListingsPublicCache()],
  ])("hard-deletes every cached public photo on %s", (_label, run) => {
    run();
    expect(revalidateTag).toHaveBeenCalledWith("public-media", { expire: 0 });
    expect(dangerouslyDeleteByTag).toHaveBeenCalledWith("public-media");
    expect(waitUntil).toHaveBeenCalledTimes(1);
  });

  it("never throws when the CDN purge itself fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    dangerouslyDeleteByTag.mockRejectedValueOnce(new Error("429"));
    expect(() => invalidateStoryListingsPublicCache()).not.toThrow();
    await waitUntil.mock.calls[0][0];
    expect(error).toHaveBeenCalledWith("Public media CDN purge failed", {
      error: "429",
    });
    error.mockRestore();
  });
});

// A purge empties the whole photo cache, so actions that cannot change which
// photos are public refresh their pages without it (2026-11-25).
describe("page-only invalidation", () => {
  it.each([
    ["a story's pages", () => invalidateStoryPagesOnly("s")],
    ["the listings", () => invalidateStoryListingPagesOnly()],
    ["a contributor's pages", () => invalidateContributorPublicCache("c")],
  ])("leaves every cached photo alone for %s", (_label, run) => {
    run();
    expect(tags()).not.toContain("public-media");
    expect(dangerouslyDeleteByTag).not.toHaveBeenCalled();
    expect(waitUntil).not.toHaveBeenCalled();
  });

  it.each([
    [
      "story",
      () => invalidateStoryPublicCache("s"),
      () => invalidateStoryPagesOnly("s"),
    ],
    [
      "listings",
      () => invalidateStoryListingsPublicCache(),
      () => invalidateStoryListingPagesOnly(),
    ],
  ])(
    "refreshes the same pages and data as the purging %s helper",
    (_label, purging, pagesOnly) => {
      purging();
      const fullPaths = paths();
      const fullTags = tags().filter((t) => t !== "public-media");
      revalidatePath.mockClear();
      revalidateTag.mockClear();
      pagesOnly();
      expect(paths()).toEqual(fullPaths);
      expect(tags()).toEqual(fullTags);
      expect(revalidateTag).toHaveBeenCalledWith("public-stories", {
        expire: 0,
      });
    },
  );
});

// The page-only helpers are only safe while a reader's access to a photo
// depends on nothing their callers write. If this fails, the proxy's rule
// has started to depend on one of those things: give the matching callers
// their photo purge back.
describe("what decides whether a photo is public", () => {
  const dir = path.join(process.cwd(), "supabase/migrations");
  /** The newest definition of a function, or "" when there is none. */
  function latestDefinition(name: string): string {
    const start = new RegExp(
      `create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${name}\\s*\\(`,
      "gi",
    );
    let latest = "";
    for (const file of readdirSync(dir).sort()) {
      if (!file.endsWith(".sql")) continue;
      const sql = readFileSync(path.join(dir, file), "utf8");
      for (const match of sql.matchAll(start)) {
        const rest = sql.slice(match.index);
        const quote = /\$\w*\$/.exec(rest);
        if (!quote) continue;
        const bodyStart = quote.index + quote[0].length;
        latest = rest.slice(bodyStart, rest.indexOf(quote[0], bodyStart));
      }
    }
    return latest;
  }

  it.each(["get_drive_media_for_proxy", "_latest_valid_consent_for_revision"])(
    "%s reads no contributor, profile, folder or journey data",
    (name) => {
      const body = latestDefinition(name);
      expect(body).not.toBe("");
      expect(body).not.toMatch(
        /contributors|profiles|parent_story_id|journey_/i,
      );
    },
  );

  // Every helper get_drive_media_for_proxy() calls: a new one would need
  // checking here too. _can_access_story_media() only decides the private,
  // never-cached branch.
  it("get_drive_media_for_proxy calls only the helpers checked here", () => {
    const body = latestDefinition("get_drive_media_for_proxy");
    const called = [...body.matchAll(/public\.(\w+)\s*\(/g)].map((m) => m[1]);
    expect(new Set(called)).toEqual(
      new Set([
        "_latest_valid_consent_for_revision",
        "_can_access_story_media",
      ]),
    );
  });
});
