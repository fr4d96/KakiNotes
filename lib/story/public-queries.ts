import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import type { CostBand } from "@/lib/validation/discovery";

// Every function here is deliberately cookie-free (lib/supabase/public.ts)
// rather than the session-bound lib/supabase/server.ts client: every RPC
// this module calls is one of the handful actually granted to `anon`
// (get_published_story, list_published_stories, get_published_story_media,
// list_distinct_public_travel_styles, list_public_contributors,
// get_public_contributor), so no session was ever needed to answer them --
// and a function that reads no cookies is one unstable_cache() is allowed
// to wrap.
//
// What that buys, and what changed on 2026-09-14 (Simplified Chinese):
//
//   The root layout now reads the language cookie (i18n/request.ts) to
//   choose <html lang> and the UI language, and a cookie read makes every
//   route beneath it render per request -- so the `revalidate` exports on
//   the public pages became no-ops and were removed. The HTML must be
//   re-rendered per request (it differs by language); the DATA does not (it
//   is identical in both), so where a page GENUINELY lost a cache, the same
//   window moved down to the data layer via unstable_cache().
//
//   Which pages genuinely lost one is the part worth checking rather than
//   assuming, because only ONE did. Read off the pre-i18n production build:
//
//     /                      (Static)   Revalidate 1m   <- really was ISR
//     /costs                 (Static)   Revalidate 1h   <- really was ISR
//     /stories/[id]          (Dynamic)  Revalidate --   <- never engaged
//     /contributors/[slug]   (Dynamic)  Revalidate --   <- never engaged
//
//   `/` and `/costs` prerendered and held their window; the two [param]
//   routes reported as Dynamic with an EMPTY Revalidate column despite
//   exporting `revalidate = 60`, i.e. they were already re-querying on
//   every single request. So listPublishedStoriesCached() below (used by
//   `/`) preserves a window that existed, while wrapping the story and
//   contributor readers would have ADDED a 60s staleness window those two
//   routes never had -- on the surfaces where staleness is least
//   acceptable (Engineering Rule 12). They deliberately call the UNCACHED
//   functions; see the header comments on those two pages.
//
//   The two index pages, /stories and /contributors, are unchanged: they
//   await searchParams, were never cacheable, and call the UNCACHED
//   functions so a filter result is always fresh. Note the cost that leaves
//   in place: /stories issues 5 round trips per visit (regions,
//   destinations, tags, travel styles, stories) plus middleware's
//   get_published_story existence check, on every request.
//
// On-demand invalidation still works. unstable_cache() entries carry
// implicit "soft" tags for the route path they were filled under
// (_N_T_/stories/<slug>, _N_T_/, ...), which is exactly what
// revalidatePath() revalidates -- so lib/story/public-cache.ts's existing
// helpers keep purging them. The explicit PUBLIC_*_TAG tags below are a
// second, path-independent handle those helpers also use, so an entry
// filled under one path (a story card on /) is not left behind when the
// story is taken down from another.
//
// `use cache` / Cache Components is the Next 16 replacement for
// unstable_cache(), and the docs mark this API as superseded -- but `use
// cache` only works under the `cacheComponents` flag, which changes the
// rendering model of the whole app. That is a migration in its own right,
// not a side effect of adding a language.

export const PUBLIC_STORIES_TAG = "public-stories";
/**
 * No reader caches under this tag today -- `/contributors/[slug]` reads
 * fresh (see above). It stays because lib/story/public-cache.ts and
 * app/(contributor)/actions.ts revalidate it beside their revalidatePath()
 * calls, so the contract is already in place for any future cached
 * contributor reader; revalidating an unused tag is a no-op.
 */
export const PUBLIC_CONTRIBUTORS_TAG = "public-contributors";

/** The window `/` really did hold under ISR, now held at the data layer. */
const PUBLIC_REVALIDATE_SECONDS = 60;

export type PublishedStoriesFilter = {
  cursorPublishedAt?: string;
  cursorId?: string;
  limit?: number;
  regionId?: string;
  destinationId?: string;
  tagId?: string;
  tripYear?: number;
  travelStyle?: string;
  contributorId?: string;
  costBand?: CostBand;
  hasReportedExpense?: boolean;
  excludeStoryId?: string;
  search?: string;
};

/** Anonymous-safe: get_published_story() re-verifies every invariant itself. */
export async function getPublishedStoryBySlug(slug: string) {
  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc("get_published_story", {
    p_slug: slug,
  });
  if (error) throw error;
  return data?.[0] ?? null;
}

/**
 * React cache() ONLY -- per-request dedupe, never across requests. It costs
 * no freshness at all (the entry dies with the request), and it stops
 * /stories/[id] issuing get_published_story twice per visit, once for
 * generateMetadata() and once for the page body. Deliberately NOT wrapped in
 * unstable_cache(): see the header for why that route must not hold a
 * cross-request window.
 */
export const getPublishedStoryBySlugDeduped = cache(getPublishedStoryBySlug);

export async function getPublishedStoryMedia(storyId: string) {
  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc("get_published_story_media", {
    p_story_id: storyId,
  });
  if (error) throw error;
  return data ?? [];
}

/** Per-request dedupe only, same rationale as getPublishedStoryBySlugDeduped. */
export const getPublishedStoryMediaDeduped = cache(getPublishedStoryMedia);

/**
 * A story's cover: the explicitly chosen photo if there is one, otherwise the
 * first photo. Never reports "no cover" for a story that has any photo.
 *
 * This is the SAME rule the SQL readers use -- `order by is_cover desc,
 * sort_order` in both list_published_stories() and, as of
 * 20260908064045_cover_falls_back_to_first_photo.sql, list_my_stories(). It
 * lives in a named function rather than inline at its one call site precisely
 * because the rule has several homes and they have to agree: they did not
 * before, which is why the public story index showed a photo while My Stories
 * showed the NoImage placeholder for the very same story.
 *
 * Relies on get_published_story_media() returning rows in `sort_order`, which
 * it does (20260803090800_story_public_reads.sql) -- so `[0]` is the first
 * photo, the same one the SQL readers pick.
 */
export function coverOf<T extends { is_cover: boolean }>(
  media: readonly T[],
): T | null {
  return media.find((item) => item.is_cover) ?? media[0] ?? null;
}

/**
 * Keyset-paginated. p_limit is clamped server-side regardless of what's
 * passed. Card-shaped rows include cover image path, regions, and tags in
 * the same query (Prompt 5) -- no per-card follow-up query.
 */
export async function listPublishedStories(
  filter: PublishedStoriesFilter = {},
) {
  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc("list_published_stories", {
    p_cursor_published_at: filter.cursorPublishedAt,
    p_cursor_id: filter.cursorId,
    p_limit: filter.limit,
    p_region_id: filter.regionId,
    p_destination_id: filter.destinationId,
    // p_work_type_id is deliberately never sent: the parameter still exists
    // on list_published_stories() (published revisions still carry work-type
    // rows) but nothing in the product filters by it any more.
    p_tag_id: filter.tagId,
    p_trip_year: filter.tripYear,
    p_travel_style: filter.travelStyle,
    p_contributor_id: filter.contributorId,
    p_cost_band: filter.costBand,
    p_has_reported_expense: filter.hasReportedExpense,
    p_exclude_story_id: filter.excludeStoryId,
    p_search: filter.search,
  });
  if (error) throw error;
  return data ?? [];
}

/**
 * For `/` and `/stories/[id]` (related stories) only -- the /stories index
 * keeps the uncached listPublishedStories() so a filter is always fresh.
 */
export const listPublishedStoriesCached = unstable_cache(
  listPublishedStories,
  ["public:list_published_stories"],
  { tags: [PUBLIC_STORIES_TAG], revalidate: PUBLIC_REVALIDATE_SECONDS },
);

/** A contributor's published stories — same RPC, contributorId filter. */
export async function listContributorPublishedStories(
  contributorId: string,
  filter: Omit<PublishedStoriesFilter, "contributorId"> = {},
) {
  return listPublishedStories({ ...filter, contributorId });
}

/** Travel-style filter options, drawn only from currently-public stories. */
export async function listDistinctPublicTravelStyles() {
  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc(
    "list_distinct_public_travel_styles",
  );
  if (error) throw error;
  return (data ?? []).map((row) => row.travel_style);
}

export type PublicContributorsFilter = {
  cursorDisplayName?: string;
  cursorId?: string;
  limit?: number;
};

/** Public contributor directory: public, named, at-least-one-published-story only. */
export async function listPublicContributors(
  filter: PublicContributorsFilter = {},
) {
  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc("list_public_contributors", {
    p_cursor_display_name: filter.cursorDisplayName,
    p_cursor_id: filter.cursorId,
    p_limit: filter.limit,
  });
  if (error) throw error;
  return data ?? [];
}

export async function getPublicContributor(slug: string) {
  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc("get_public_contributor", {
    p_slug: slug,
  });
  if (error) throw error;
  return data?.[0] ?? null;
}

/** Per-request dedupe only, same rationale as getPublishedStoryBySlugDeduped. */
export const getPublicContributorDeduped = cache(getPublicContributor);

// --- Lookup tables, cookie-free variant ------------------------------------
//
// Same tables/rows lib/story/active-lookups.ts already reads (anon-readable
// where active = true) -- duplicated here rather than reused so the
// authoring UI's existing cookie-bound queries are untouched, and these
// public-page reads stay on the cookie-free client above.

// `slug` is carried alongside `name` so lib/i18n/vocab.ts can show the
// closed regions/destinations vocabulary in the visitor's language. Tags
// keep only their name: a tag is the contributor's own word and is never
// translated.
export type PublicRegion = {
  id: string;
  name: string;
  slug: string;
  name_zh_cn: string | null;
};
export type PublicDestination = {
  id: string;
  name: string;
  slug: string;
  regionId: string;
  name_zh_cn: string | null;
};
export type PublicTag = { id: string; name: string };

export async function listPublicRegions(): Promise<PublicRegion[]> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("regions")
    .select("id, name, slug, name_zh_cn")
    .eq("active", true)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function listPublicDestinations(): Promise<PublicDestination[]> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("destinations")
    .select("id, name, slug, region_id, name_zh_cn")
    .eq("active", true)
    .order("name");
  if (error) throw error;
  return (data ?? []).map((d) => ({
    id: d.id,
    name: d.name,
    slug: d.slug,
    regionId: d.region_id,
    name_zh_cn: d.name_zh_cn,
  }));
}

// No listPublicWorkTypes: tags are the only taxonomy offered on the public
// browse surface as of 2026-08-16 (every non-fixture work_types row is now
// inactive).

export async function listPublicTags(): Promise<PublicTag[]> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("tags")
    .select("id, name")
    .eq("active", true)
    .order("name");
  if (error) throw error;
  return data ?? [];
}
