import "server-only";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import { downloadMediaPreviewBytes } from "@/lib/story/image-pipeline";
import { getAccessToken, downloadFileBytes } from "@/lib/drive/drive-client";

/**
 * Byte-returning sibling of lib/story/image-url.ts#getImageUrl(), for a
 * caller that needs the actual bytes rather than a URL — today, only the
 * PDF export (app/(contributor)/stories/[id]/export/route.ts), which has
 * to embed the image directly. Same contract as
 * downloadMediaPreviewBytes(): the CALLER must have already authorized
 * the request (authorize_story_media_preview(), on their own regular
 * client) — this function performs no authorization of its own.
 *
 * For a `supabase` row: calls downloadMediaPreviewBytes() unchanged — a
 * contributor who never connects Drive gets byte-for-byte the same export
 * as today.
 *
 * For a `google_drive` row: re-runs get_drive_media_for_proxy() (the same
 * RPC app/media/[mediaId]/route.ts calls) on the caller's own session
 * client. That RPC does its own authorization check internally too
 * (either the anonymous/published branch or the same _can_access_story_media()
 * the caller's earlier authorize_story_media_preview() call already used)
 * — calling it again here is redundant with that earlier check, not a
 * second, weaker one, and it's the only way this function learns the
 * Drive file id and the owning contributor's id without a new RPC. The
 * owner's access token is looked up the same way the proxy route looks it
 * up: keyed by the id the RPC itself returns, never by anything the
 * caller supplies.
 */
export type ImageBytesMedia = {
  id: string;
  storage_backend: "supabase" | "google_drive";
};

export type ImageBytesResult = { bytes: Buffer; width: number; height: number };

type DriveProxyRow = {
  drive_processed_file_id: string | null;
  owner_user_id: string | null;
};

export async function getImageBytes(
  media: ImageBytesMedia,
): Promise<ImageBytesResult | null> {
  if (media.storage_backend === "supabase") {
    try {
      return await downloadMediaPreviewBytes(media.id);
    } catch {
      return null;
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_drive_media_for_proxy", {
    p_media_id: media.id,
  });
  if (error) return null;
  const rows = (data ?? []) as unknown as DriveProxyRow[];
  const row = rows[0];
  if (!row || !row.owner_user_id || !row.drive_processed_file_id) return null;

  try {
    const accessToken = await getAccessToken(row.owner_user_id);
    const bytes = await downloadFileBytes(
      accessToken,
      row.drive_processed_file_id,
    );
    const metadata = await sharp(bytes).metadata();
    if (!metadata.width || !metadata.height) return null;
    return { bytes, width: metadata.width, height: metadata.height };
  } catch {
    return null;
  }
}
