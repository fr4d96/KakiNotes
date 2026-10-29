import "server-only";
import { mintMediaPreviewSignedUrl } from "@/lib/story/image-pipeline";
import type { createClient } from "@/lib/supabase/server";

/**
 * Shared by mintPreviewUrlAction/mintPreviewUrlsAction
 * (app/(contributor)/stories/[id]/media-actions.ts), which back EVERY
 * private-preview thumbnail in the app (the editor's own upload panel,
 * the owner/editor preview page, the moderator review gallery, and the
 * My Stories cover thumbnail) — fixing it here fixes all of them at once.
 *
 * The caller must have already run authorize_story_media_preview() on
 * `supabase` (the caller's own regular session client) — this function
 * performs no authorization of its own, same contract
 * mintMediaPreviewSignedUrl() already has.
 *
 * For a `supabase`-backend media id: calls mintMediaPreviewSignedUrl()
 * exactly as before — byte-for-byte unchanged for every contributor who
 * never connects Drive.
 *
 * For a `google_drive`-backend media id: mintMediaPreviewSignedUrl() would
 * fail outright (a Drive row has no private_storage_path to sign). Returns
 * the proxy route's own path instead — the proxy authorizes the SAME way
 * (get_drive_media_for_proxy's preview branch is _can_access_story_media(),
 * the same rule authorize_story_media_preview() already checked) and
 * responds `Cache-Control: private, no-store`, so this is never a publicly
 * cacheable preview.
 */
export async function resolvePreviewImageUrl(
  supabase: Awaited<ReturnType<typeof createClient>>,
  mediaId: string,
): Promise<string> {
  const { data, error } = await supabase.rpc("get_drive_media_for_proxy", {
    p_media_id: mediaId,
  });
  if (!error) {
    const rows = (data ?? []) as { drive_processed_file_id?: string | null }[];
    if (rows.length > 0 && rows[0].drive_processed_file_id) {
      return `/media/${mediaId}`;
    }
  }
  return mintMediaPreviewSignedUrl(mediaId);
}
