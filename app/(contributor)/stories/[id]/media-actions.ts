"use server";

import { getTranslations } from "next-intl/server";

import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { createClient } from "@/lib/supabase/server";
import { mintMediaPreviewSignedUrl } from "@/lib/story/image-pipeline";
import {
  getStoryPreview,
  type RevisionMediaItem,
} from "@/lib/story/contributor-queries";
import { getErrorMessage } from "@/lib/errors";
import { MAX_PREVIEW_URLS_PER_BATCH } from "@/lib/story/preview-url-batch";

/**
 * Re-reads the current attached-media list (via get_story_preview — the
 * same private, path-free RPC the preview page uses) so the image manager
 * can pick up the real server-recorded processingState after an upload
 * request has finished processing synchronously (there is no background
 * worker in this phase — see the upload Route Handler).
 */
export async function refreshMediaAction(
  storyId: string,
): Promise<{ media: RevisionMediaItem[] } | { error: string }> {
  const [tErr, tCommon] = await Promise.all([
    getTranslations("actionErrors"),
    getTranslations("common"),
  ]);
  const user = await getCurrentUser();
  if (!user) return { error: tCommon("mustBeSignedIn") };
  const parsed = z.uuid().safeParse(storyId);
  if (!parsed.success) return { error: tErr("invalidStory") };

  try {
    const preview = await getStoryPreview(parsed.data);
    return { media: preview?.media ?? [] };
  } catch (error) {
    return {
      error: getErrorMessage(error, tErr("refreshMediaFailed")),
    };
  }
}

/**
 * Shared by both the edit page's image manager (thumbnails for already-
 * processed uploads) and the preview page. Two-step, both required:
 *  1. authorize_story_media_preview() via the CALLER'S OWN regular
 *     (RLS-respecting) client — this is the actual authorization check
 *     (owner/linked contributor/assigned editor/admin, or a moderator
 *     scoped to a revision they're genuinely reviewing).
 *  2. Only after that succeeds, mintMediaPreviewSignedUrl() from
 *     lib/story/image-pipeline.ts (the one module allowed to hold the
 *     admin client) looks up the private path and mints a short-lived
 *     signed URL. The private storage path itself is never sent to the
 *     browser — only the final bearer URL.
 */
export async function mintPreviewUrlAction(
  mediaId: string,
): Promise<{ url: string } | { error: string }> {
  const [tErr, tCommon] = await Promise.all([
    getTranslations("actionErrors"),
    getTranslations("common"),
  ]);
  const user = await getCurrentUser();
  if (!user) return { error: tCommon("mustBeSignedIn") };

  const parsed = z.uuid().safeParse(mediaId);
  if (!parsed.success) return { error: tErr("invalidMedia") };

  const supabase = await createClient();
  const { error: authError } = await supabase.rpc(
    "authorize_story_media_preview",
    { p_media_id: parsed.data },
  );
  if (authError) {
    return { error: tErr("previewNotAuthorized") };
  }

  try {
    const url = await mintMediaPreviewSignedUrl(parsed.data);
    return { url };
  } catch (error) {
    return {
      error: getErrorMessage(error, tErr("loadImageFailed")),
    };
  }
}

export type PreviewUrlBatchResult = Record<
  string,
  { url: string } | { error: string }
>;

/**
 * Batch sibling of mintPreviewUrlAction(): the SAME two-step contract per
 * media id (authorize_story_media_preview() on the caller's own regular
 * client first, then -- only for the ids that passed -- a signed URL from
 * lib/story/image-pipeline.ts), but for a whole revision's images in one
 * round trip, with the per-id work fanned out in parallel.
 *
 * Exists because the preview page and the moderation review page both used
 * to mint one image at a time, sequentially, through mintPreviewUrlAction
 * -- and each of those calls is its own Server Action round trip plus an
 * auth lookup, an authorize RPC, a path RPC and a storage sign. On a story
 * with a dozen inline photos that was a dozen serial trips (twice, since
 * the gallery and the body each minted independently) and read to a
 * moderator as "the images take forever to process". Nothing was being
 * processed; it was waiting on URLs.
 *
 * Authorization is still per id and still the caller's own client: a batch
 * containing one id the caller may not see returns an error entry for that
 * id and URLs for the rest -- never all-or-nothing in either direction,
 * and never a URL for an id that failed its own check.
 */
export async function mintPreviewUrlsAction(
  mediaIds: string[],
): Promise<PreviewUrlBatchResult | { error: string }> {
  const [tErr, tCommon] = await Promise.all([
    getTranslations("actionErrors"),
    getTranslations("common"),
  ]);
  const user = await getCurrentUser();
  if (!user) return { error: tCommon("mustBeSignedIn") };

  const parsed = z
    .array(z.uuid())
    .max(MAX_PREVIEW_URLS_PER_BATCH)
    .safeParse(mediaIds);
  if (!parsed.success) return { error: tErr("invalidMedia") };

  const uniqueIds = [...new Set(parsed.data)];
  const supabase = await createClient();

  const entries = await Promise.all(
    uniqueIds.map(
      async (mediaId): Promise<[string, PreviewUrlBatchResult[string]]> => {
        const { error: authError } = await supabase.rpc(
          "authorize_story_media_preview",
          { p_media_id: mediaId },
        );
        if (authError)
          return [mediaId, { error: tErr("previewNotAuthorized") }];
        try {
          return [mediaId, { url: await mintMediaPreviewSignedUrl(mediaId) }];
        } catch (error) {
          return [
            mediaId,
            { error: getErrorMessage(error, tErr("loadImageFailed")) },
          ];
        }
      },
    ),
  );

  return Object.fromEntries(entries);
}
