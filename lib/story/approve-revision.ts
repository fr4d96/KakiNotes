import "server-only";
import {
  beginStoryPublicationAttempt,
  finalizeStoryPublication,
  getStoryForModerator,
  parseModeratorMedia,
  type ModeratorMediaItem,
  type ModeratorStoryDetail,
} from "@/lib/story/moderation";
import { copyStoryMediaToPublic } from "@/lib/story/image-pipeline";
import { runApproveOrchestration } from "@/lib/story/publish-orchestration";
import {
  invalidateStoryListingsPublicCache,
  invalidateStoryPagesOnly,
  invalidateStoryPublicCache,
} from "@/lib/story/public-cache";
import { logStaffAction } from "@/lib/log";
import { getErrorMessage } from "@/lib/errors";

/**
 * Stage 3 hardening: the invalidate helpers call Next's revalidatePath()
 * several times in a row. A successful approve/archive has ALREADY
 * committed in the database by then -- if revalidatePath() ever throws,
 * letting that out of the Server Action would make a successful publish
 * look like a failure. So it is logged and swallowed, never propagated; the
 * public pages self-correct either way (see lib/story/public-cache.ts).
 */
export function invalidatePublicCacheSafely(
  slug: string,
  action: string,
  { purgePhotos = true }: { purgePhotos?: boolean } = {},
) {
  try {
    if (purgePhotos) invalidateStoryPublicCache(slug);
    else invalidateStoryPagesOnly(slug);
  } catch (error) {
    logStaffAction({
      actor: null,
      action: `${action}.cache_invalidation`,
      target: slug,
      outcome: "error",
      detail: getErrorMessage(error, "unknown error"),
    });
  }
}

/**
 * Slug-less variant, for when the story's slug could not be re-derived
 * server-side (see archiveStoryAction). Same contract.
 */
export function invalidateListingsCacheSafely(target: string, action: string) {
  try {
    invalidateStoryListingsPublicCache();
  } catch (error) {
    logStaffAction({
      actor: null,
      action: `${action}.cache_invalidation`,
      target,
      outcome: "error",
      detail: getErrorMessage(error, "unknown error"),
    });
  }
}

export type ApproveRevisionResult =
  | {
      ok: true;
      title: string;
      /** The caller still has to empty the photo cache (deferPhotoPurge). */
      photoPurgeDue: boolean;
    }
  | { ok: false; title: string | null; error: string };

/**
 * Approve and publish ONE submitted revision: load it server-side, begin a
 * publication attempt, copy whatever photos need copying, finalize, then
 * refresh the public pages. Shared by the review screen's button and the
 * queue's bulk approve, so there is one publishing path, not two.
 *
 * The caller MUST already have checked the moderator/admin role; every RPC
 * underneath re-checks it (Engineering Rules 2 and 3). Nothing but the
 * revision id is taken from the client: the story, its photos and its slug
 * are all read here.
 */
export async function approveRevision(params: {
  revisionId: string;
  actorId: string | null;
  /** For the audit log: "moderation.approve" / "moderation.bulk_approve". */
  action: string;
  /** When given, the revision must belong to this story. */
  expectedStoryId?: string;
  userFacingReason?: string;
  editorNote?: string;
  /**
   * True when the caller approves several stories and empties the photo
   * cache once itself afterwards (Vercel's Active CPU allowance is small:
   * every purge makes each photo be fetched and resized again). Only honoured
   * for a story's FIRST publication. A replacement can take photos out of
   * public view, so it always purges at once (Engineering Rules 12-13).
   */
  deferPhotoPurge?: boolean;
  /** Extra refusals, run before anything is written. */
  blocker?: (
    detail: ModeratorStoryDetail,
    media: ModeratorMediaItem[],
  ) => string | null;
}): Promise<ApproveRevisionResult> {
  const { revisionId, actorId, action } = params;

  let detail: ModeratorStoryDetail | undefined;
  try {
    detail = (await getStoryForModerator(revisionId))[0];
  } catch (error) {
    return {
      ok: false,
      title: null,
      error: getErrorMessage(error, "Could not load this revision."),
    };
  }
  if (
    !detail ||
    (params.expectedStoryId !== undefined &&
      detail.story_id !== params.expectedStoryId)
  ) {
    return {
      ok: false,
      title: null,
      error: "This revision no longer matches the requested story.",
    };
  }

  const title = detail.title;
  const media = parseModeratorMedia(detail.media);

  const blocked = params.blocker?.(detail, media) ?? null;
  if (blocked) {
    logStaffAction({
      actor: actorId,
      action,
      target: revisionId,
      outcome: "error",
      detail: `blocked: ${blocked}`,
    });
    return { ok: false, title, error: blocked };
  }

  const result = await runApproveOrchestration(
    {
      revisionId,
      media,
      userFacingReason: params.userFacingReason || undefined,
      editorNote: params.editorNote || undefined,
    },
    {
      beginAttempt: beginStoryPublicationAttempt,
      copyMedia: copyStoryMediaToPublic,
      finalize: finalizeStoryPublication,
    },
  );

  if (!result.ok) {
    const stageLabel =
      result.stage === "begin"
        ? "starting the publication attempt"
        : result.stage === "copy_media"
          ? `copying media ${result.mediaId ?? "(unknown)"} to public storage`
          : "finalizing publication";
    const recoveryNote = result.approvalAttemptId
      ? " The publication attempt was left active/recoverable — retry approval, or resolve it via reject/changes-requested."
      : "";
    logStaffAction({
      actor: actorId,
      action,
      target: revisionId,
      outcome: "error",
      detail: result.stage,
    });
    return {
      ok: false,
      title,
      error: `Approval failed while ${stageLabel}: ${result.error}.${recoveryNote}`,
    };
  }

  const firstPublication = detail.lifecycle_status === "pending_review";
  const deferred = Boolean(params.deferPhotoPurge) && firstPublication;
  invalidatePublicCacheSafely(detail.slug, action, { purgePhotos: !deferred });
  logStaffAction({
    actor: actorId,
    action,
    target: revisionId,
    outcome: "success",
  });
  return { ok: true, title, photoPurgeDue: deferred };
}
