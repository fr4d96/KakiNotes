import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getModerationQueue,
  getModerationQueueCards,
  getStoryForModerator,
  getPublishedRevisionSnapshot,
  getStoryModerationHistory,
  getStoryEditorialHistory,
  listReportsForStaff,
} from "@/lib/story/moderation";
import { getPublishedStoryMedia } from "@/lib/story/public-queries";
import { getStoryCountry } from "@/lib/story/contributor-queries";
import { ReviewView } from "./review-view";

export const metadata: Metadata = {
  title: "Review Story",
  robots: { index: false, follow: false },
};

// Staff review content -- may reflect draft/pending state -- never
// cached/pre-rendered.
export const dynamic = "force-dynamic";

/**
 * URL param decision: `[id]` is a REVISION id, not a story id.
 *
 * get_story_for_moderator()'s own key is revision_id, and the brief itself
 * emphasizes reviewing "the exact submitted revision" -- a story can have
 * more than one revision across its lifetime (rejected, changes_requested,
 * resubmitted), so a story-id URL would be ambiguous about which
 * revision's content is actually being displayed, and would need an extra
 * "current submitted revision for this story" lookup that doesn't exist as
 * a moderator-scoped function today. A revision-id URL is unambiguous and
 * matches this page's primary data source directly. story_id (needed for
 * moderation/editorial history and reports, none of which are keyed by
 * revision) is derived from the fetched row, not re-parsed from the URL.
 */
export default async function ModerationReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: revisionId } = await params;

  const rows = await getStoryForModerator(revisionId).catch(() => null);
  const detail = rows?.[0];
  if (!detail) notFound();

  const [
    snapshotRows,
    moderationHistory,
    editorialHistory,
    reports,
    publishedMedia,
    cards,
    queueFront,
  ] = await Promise.all([
    getPublishedRevisionSnapshot(detail.story_id),
    getStoryModerationHistory(detail.story_id),
    getStoryEditorialHistory(detail.story_id),
    listReportsForStaff({ storyId: detail.story_id, limit: 50 }),
    // Anonymous-safe (get_published_story_media requires visibility =
    // 'public' AND lifecycle_status = 'published'): during a replacement
    // review the story stays published throughout, so this is exactly the
    // currently-live media set to compare against -- and it's already
    // promoted to the public bucket, so unlike the submitted revision's
    // media (still private) it needs no signed-URL mint, just a plain
    // public URL.
    getPublishedStoryMedia(detail.story_id),
    getModerationQueueCards([revisionId]).catch(() => null),
    // Two, because the story on screen may be one of them.
    getModerationQueue({ status: "submitted", limit: 2 }).catch(() => []),
  ]);

  const card = cards?.get(revisionId) ?? null;
  // get_story_country() answers for an admin but not a plain moderator; it
  // only fills in when the queue card could not.
  const countrySlug =
    card?.country_slug ??
    (await getStoryCountry(detail.story_id).catch(() => null));

  return (
    <ReviewView
      detail={detail}
      countrySlug={countrySlug}
      currency={card?.currency ?? null}
      publishedSnapshot={snapshotRows[0] ?? null}
      publishedMedia={publishedMedia}
      moderationHistory={moderationHistory}
      editorialHistory={editorialHistory}
      reports={reports}
      nextRevisionId={
        queueFront.find((row) => row.revision_id !== revisionId)?.revision_id ??
        null
      }
      now={new Date()}
    />
  );
}
