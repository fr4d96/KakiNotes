"use server";

import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { createClient } from "@/lib/supabase/server";
import { mintMediaDownloadSignedUrl } from "@/lib/story/image-pipeline";
import { getErrorMessage } from "@/lib/errors";

/**
 * My Photos "Download" (docs/google-drive-integration.md section 7). Always
 * the processed photo, never a raw original (Rule 14). The only input is a
 * media id; who may download it is decided by authorize_story_media_preview()
 * on the caller's own client, exactly as for an editor preview.
 *
 * Returns a URL the browser then opens: a signed, save-as-file URL for a
 * Kakinotes-stored photo, or /media/<id>?download=1 for a Drive-stored one
 * (the proxy re-checks access itself).
 */
export async function getPhotoDownloadUrlAction(
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
  if (authError) return { error: tErr("previewNotAuthorized") };

  // Same backend check resolvePreviewImageUrl() uses: a row here means the
  // photo lives in Drive and the caller may see it.
  const { data: driveRows, error: driveError } = await supabase.rpc(
    "get_drive_media_for_proxy",
    { p_media_id: parsed.data },
  );
  if (!driveError && (driveRows ?? []).length > 0) {
    return { url: `/media/${parsed.data}?download=1` };
  }

  try {
    return { url: await mintMediaDownloadSignedUrl(parsed.data) };
  } catch (error) {
    return { error: getErrorMessage(error, tErr("loadImageFailed")) };
  }
}
