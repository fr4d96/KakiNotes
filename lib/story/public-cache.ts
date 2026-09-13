import "server-only";
import { revalidatePath, revalidateTag } from "next/cache";
import {
  PUBLIC_CONTRIBUTORS_TAG,
  PUBLIC_STORIES_TAG,
} from "@/lib/story/public-queries";

// Prompt 5's public pages all read through the cookie-free client in
// lib/supabase/public.ts, but they do NOT all cache, and the difference
// matters when reasoning about staleness:
//
//   - app/(public)/page.tsx        -- DATA cached 60s (unstable_cache, the
//   - app/(public)/stories/[id]       *Cached readers in public-queries.ts).
//   - app/(public)/contributors/[slug]   Until 2026-09-14 these were ISR
//                                        pages (`revalidate = 60`); the
//                                        language cookie made every route
//                                        dynamic, so the same window moved
//                                        from the page to its queries.
//   - app/(public)/stories         -- NO caching. Both await searchParams,
//   - app/(public)/contributors       which forces dynamic rendering, and
//                                     both call the UNCACHED readers. These
//                                     two are re-queried on every single
//                                     request and are therefore always fresh.
//
// So the three cached surfaces are eventually consistent within a minute on
// their own; the two index pages need no invalidation at all. These helpers
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
  revalidatePath("/stories");
  revalidatePath("/");
  revalidatePath("/sitemap.xml");
  revalidateTag(PUBLIC_STORIES_TAG, { expire: 0 });
}

export function invalidateStoryPublicCache(slug: string) {
  revalidatePath(`/stories/${slug}`);
  invalidateStoryListingsPublicCache();
}

export function invalidateContributorPublicCache(contributorSlug: string) {
  revalidatePath(`/contributors/${contributorSlug}`);
  revalidatePath("/contributors");
  revalidatePath("/sitemap.xml");
  revalidateTag(PUBLIC_CONTRIBUTORS_TAG, { expire: 0 });
}
