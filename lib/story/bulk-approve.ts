import type {
  ModeratorMediaItem,
  ModeratorStoryDetail,
} from "@/lib/story/moderation";
import { normalizeStoryContentJson } from "@/lib/story/legacy-content";
import { storyContentText } from "@/lib/validation/story";

/**
 * Pure rules for approving several stories at once, shared by the Server
 * Action and the review screen. No I/O. The client-side half (chunking) is
 * lib/story/bulk-approve-chunk.ts, kept apart so the queue doesn't ship the
 * content parser to the browser.
 */

/** Is this photo finished processing, so publishing can go ahead with it? */
export function isMediaReady(item: ModeratorMediaItem): boolean {
  return (
    item.processingState === "processed" ||
    item.processingState === "promotion_pending" ||
    item.processingState === "promoted"
  );
}

/** Text a reader would actually see; false for empty or unreadable content. */
export function hasReadableContent(contentJson: unknown): boolean {
  const parsed = normalizeStoryContentJson(contentJson);
  return parsed !== null && storyContentText(parsed).trim() !== "";
}

/**
 * Why this revision must not be approved in bulk, or null when it may be.
 *
 * Runs BEFORE begin_story_publication_attempt(), on purpose: a story that is
 * known to fail later -- no valid consent, a photo that is not ready -- never
 * gets a half-made publication attempt to clean up or resume.
 *
 * Empty content is the one rule that is stricter than approving a single
 * story: the review screen warns and lets a moderator insist, but nobody is
 * looking at the story here, so an empty one is always sent to the screen
 * where somebody will be. The database stays the authority either way
 * (Engineering Rule 3).
 */
export function bulkApproveBlocker(
  detail: Pick<
    ModeratorStoryDetail,
    "revision_status" | "consent_valid" | "content_json"
  >,
  media: ModeratorMediaItem[],
): string | null {
  if (detail.revision_status !== "submitted") {
    return "No longer waiting on a decision.";
  }
  if (!detail.consent_valid) return "No valid consent on file.";
  if (!hasReadableContent(detail.content_json)) {
    return "No readable story text.";
  }
  if (!media.every(isMediaReady)) return "A photo has not finished processing.";
  return null;
}
