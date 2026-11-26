import "server-only";
import { revalidatePath, revalidateTag } from "next/cache";
import { COUNTRY_SLUGS, countryUrlPrefix } from "@/lib/story/countries";
import { dangerouslyDeleteByTag, waitUntil } from "@vercel/functions";
import { PUBLIC_MEDIA_TAG } from "@/lib/story/public-media-cache";
import {
  PUBLIC_CONTRIBUTORS_TAG,
  PUBLIC_STORIES_TAG,
} from "@/lib/story/public-queries";

// Prompt 5's public pages all read through the cookie-free client in
// lib/supabase/public.ts, but they do NOT all cache, and the difference
// matters when reasoning about staleness:
//
//   - app/(public)/page.tsx        -- DATA cached 60s (listPublishedStoriesCached,
//                                     unstable_cache). This page really did
//                                     prerender with a 60s window before the
//                                     language cookie made every route
//                                     dynamic, so the window moved from the
//                                     page to its query.
//   - app/(public)/costs           -- DATA cached 1h, same story.
//   - app/(public)/stories/[id]    -- NO cross-request caching, and never had
//   - app/(public)/contributors/[slug]   any. An earlier version of this
//                                     comment said these were "ISR pages";
//                                     main's own .next/prerender-manifest.json
//                                     lists no dynamic routes at all, so their
//                                     `revalidate = 60` exports never engaged.
//                                     They re-query every request. Do not
//                                     "restore" a window here -- there was
//                                     none, and adding one is a minute of
//                                     staleness on a taken-down story.
//   - app/(public)/stories         -- NO caching. Both await searchParams,
//   - app/(public)/contributors       which forces dynamic rendering, and
//                                     both call the UNCACHED readers. These
//                                     two are re-queried on every single
//                                     request and are therefore always fresh.
//
// So `/` and `/costs` are eventually consistent within their own window; the
// four others re-query every request and need no invalidation to be correct. These helpers
// are for *on-demand* invalidation the moment public visibility actually
// changes -- revalidatePath() on an uncached path is simply a harmless
// no-op, which is why the lists below still name /stories and /contributors
// rather than special-casing them.
//
// revalidatePath() still reaches the data cache: an unstable_cache() entry
// is soft-tagged with the path it was filled under, and revalidatePath() is
// a tag revalidation on that same path. The revalidateTag() calls below are
// the path-independent belt to that: `{ expire: 0 }` rather than "max",
// because a takedown must not serve stale-while-revalidate -- Engineering
// Rule 12 says the story is gone NOW, not after one more visitor.
//
// Deliberately NOT called from lib/story/moderation.ts's archiveStory() or
// lib/story/mutations.ts's revokePublicationConsent() -- both are reusable
// domain/repository functions, and revalidatePath/revalidateTag belong at
// the Server Action or Route Handler orchestration boundary that calls
// them, not inside the reusable function itself (a function like
// archiveStory() may end up called from more than one place, e.g. a
// contributor-initiated withdrawal vs. a staff action, and each caller
// knows its own routing/paths better than the shared function should).
//
// Both callers now exist, and both invalidate (2026-09-05):
//
//   - archiveStory()             -> app/(moderation)/moderation/stories/[id]/
//                                   actions.ts#archiveStoryAction, which
//                                   re-derives the slug via
//                                   getStoryForModerator() and falls back to
//                                   the listings-only helper when it can't.
//   - revokePublicationConsent() -> app/(contributor)/my-stories/
//                                   actions.ts#withdrawPublishedStoryAction,
//                                   which re-derives the slug from the
//                                   owner-scoped list_my_stories().
//
// Both wrap the call so a revalidatePath() failure is logged, never
// propagated: the mutation has already committed by then, and a cache hiccup
// must not be reported to the user as a failed archive/takedown.
//
// Any FUTURE Server Action that changes public visibility must do the same,
// calling the matching helper below immediately after its mutation succeeds:
//
//   - finalize_story_publication() succeeds -> invalidateStoryPublicCache(slug)
//   - archiveStory() succeeds               -> invalidateStoryPublicCache(slug)
//   - revokePublicationConsent() succeeds   -> invalidateStoryPublicCache(slug)
//   - a slug change is ever supported       -> invalidate both old and new slugs
//   - the slug cannot be re-derived server-side (a caller must NEVER trust a
//     client-supplied slug, per Engineering Rule 2, so this is a real case:
//     archiving a long-published story with no in-flight revision has no
//     moderator-readable slug source) -> invalidateStoryListingsPublicCache()
//
// That last entry is the point of splitting the two functions below. Doing
// nothing at all when the slug is unknown is NOT an acceptable fallback for a
// visibility change: /stories, / and the sitemap are exactly the surfaces that
// keep advertising a story that just went private (Engineering Rule 12), and
// they need no slug to purge. Only the /stories/[slug] detail page does.

/**
 * Every public surface that lists stories but is not slug-specific. Safe to
 * call when the slug is unknown; it is a strict subset of
 * invalidateStoryPublicCache() below, which is why that one delegates here
 * rather than repeating the path list.
 */
export function invalidateStoryListingsPublicCache() {
  invalidateStoryListingPagesOnly();
  purgePublicMediaCache();
}

/**
 * The listings WITHOUT the photo purge, for an action that cannot change
 * which photos the /media proxy will serve (2026-11-25). A purge drops every
 * cached photo on the site and each one then costs a Supabase check and a
 * Drive download to bring back, so it must not run on, say, a map pin.
 *
 * Only safe when the action leaves the public answer of
 * get_drive_media_for_proxy() unchanged for every photo that is public
 * now. That answer depends on the story's visibility, lifecycle_status,
 * published_revision_id and consent_revoked_at, the published revision's
 * photo list and consent row, and the photo's storage_backend, Drive file id
 * and mime type -- nothing else (guarded by a test in public-cache.test.ts).
 * When in doubt, use the purging helper: over-purging costs speed, while
 * under-purging can leave a withdrawn photo public for days.
 */
export function invalidateStoryListingPagesOnly() {
  revalidatePath("/stories");
  revalidatePath("/");
  revalidatePath("/sitemap.xml");
  revalidateTag(PUBLIC_STORIES_TAG, { expire: 0 });
}

/**
 * Drops every published photo the /media proxy has put in Vercel's CDN
 * (all tagged PUBLIC_MEDIA_TAG, see lib/story/public-media-cache.ts), so a
 * photo that just stopped being public is never served from cache again --
 * it is cached for days precisely because this runs on every visibility
 * change. Called by both story helpers that every such action already goes
 * through.
 *
 * Two calls on purpose. revalidateTag(tag, { expire: 0 }) is Next's own
 * purge, which Vercel applies to its CDN too; dangerouslyDeleteByTag() is
 * Vercel's explicit CDN delete (not invalidateByTag(): that one serves the
 * stale copy once more, and a takedown must not). The delete is async;
 * waitUntil keeps it running after the action has answered. Both are
 * no-ops off Vercel (local dev, tests). A purge failure is logged, never
 * thrown: the mutation has already committed.
 */
function purgePublicMediaCache() {
  revalidateTag(PUBLIC_MEDIA_TAG, { expire: 0 });
  try {
    waitUntil(
      dangerouslyDeleteByTag(PUBLIC_MEDIA_TAG).catch((error: unknown) => {
        console.error("Public media CDN purge failed", {
          error: error instanceof Error ? error.message : error,
        });
      }),
    );
  } catch (error) {
    console.error("Public media CDN purge failed", {
      error: error instanceof Error ? error.message : error,
    });
  }
}

export function invalidateStoryPublicCache(slug: string) {
  revalidatePath(`/stories/${slug}`);
  invalidateStoryListingsPublicCache();
}

/** The same without the photo purge; see invalidateStoryListingPagesOnly(). */
export function invalidateStoryPagesOnly(slug: string) {
  revalidatePath(`/stories/${slug}`);
  invalidateStoryListingPagesOnly();
}

/**
 * A contributor's own pages. No photo purge: the /media proxy never reads
 * the contributors table, so a profile or avatar change cannot make a photo
 * stop (or start) being public. Taking a contributor's stories out of view
 * goes through the story helpers above, which do purge.
 */
export function invalidateContributorPublicCache(contributorSlug: string) {
  for (const country of COUNTRY_SLUGS) {
    const prefix = countryUrlPrefix(country);
    revalidatePath(`${prefix}/contributors/${contributorSlug}`);
    revalidatePath(`${prefix}/contributors`);
  }
  revalidatePath("/sitemap.xml");
  revalidateTag(PUBLIC_CONTRIBUTORS_TAG, { expire: 0 });
}
