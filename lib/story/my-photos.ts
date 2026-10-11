import "server-only";
import { createClient } from "@/lib/supabase/server";
import { mintMediaPreviewSignedUrls } from "@/lib/story/image-pipeline";

/**
 * Data for the My Photos page (docs/google-drive-integration.md section 7).
 * Everything comes from list_my_photos(), which returns only the caller's
 * own photos; that is also what authorizes minting their thumbnail URLs.
 */

// Long enough that a lazily-loaded thumbnail far down the page still loads;
// the tile asks for a fresh one if it expires anyway (my-photos-view.tsx).
const THUMBNAIL_URL_SECONDS = 600;

export type MyPhoto = {
  mediaId: string;
  storageBackend: "supabase" | "google_drive";
  altText: string | null;
  caption: string | null;
  width: number | null;
  height: number | null;
  inCurrentVersion: boolean;
  /** null when it can't be shown right now (e.g. Drive is disconnected). */
  thumbnailUrl: string | null;
};

export type MyPhotoStory = {
  storyId: string;
  title: string | null;
  lifecycleStatus: string;
  photos: MyPhoto[];
};

/** Groups list_my_photos() rows (already in story, then display order). */
export function groupPhotosByStory(
  rows: readonly {
    media_id: string;
    story_id: string;
    story_title: string | null;
    lifecycle_status: string;
    storage_backend: string;
    alt_text: string | null;
    caption: string | null;
    processed_width: number | null;
    processed_height: number | null;
    in_current_version: boolean;
  }[],
  thumbnailFor: (
    mediaId: string,
    backend: MyPhoto["storageBackend"],
  ) => string | null,
): MyPhotoStory[] {
  const stories: MyPhotoStory[] = [];
  const byId = new Map<string, MyPhotoStory>();
  for (const row of rows) {
    let story = byId.get(row.story_id);
    if (!story) {
      story = {
        storyId: row.story_id,
        title: row.story_title,
        lifecycleStatus: row.lifecycle_status,
        photos: [],
      };
      byId.set(row.story_id, story);
      stories.push(story);
    }
    const backend =
      row.storage_backend === "google_drive" ? "google_drive" : "supabase";
    story.photos.push({
      mediaId: row.media_id,
      storageBackend: backend,
      altText: row.alt_text,
      caption: row.caption,
      width: row.processed_width,
      height: row.processed_height,
      inCurrentVersion: row.in_current_version,
      thumbnailUrl: thumbnailFor(row.media_id, backend),
    });
  }
  return stories;
}

export async function listMyPhotos(options: {
  driveConnected: boolean;
}): Promise<MyPhotoStory[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_my_photos");
  if (error) throw error;
  const rows = data ?? [];

  const supabaseIds = rows
    .filter((row) => row.storage_backend !== "google_drive")
    .map((row) => row.media_id);
  let signed: Record<string, string> = {};
  try {
    signed = await mintMediaPreviewSignedUrls(
      supabaseIds,
      THUMBNAIL_URL_SECONDS,
    );
  } catch (err) {
    // Thumbnails are a nicety: the page still lists every photo and each
    // tile retries on its own.
    console.error("My Photos: thumbnail URLs failed", err);
  }

  return groupPhotosByStory(rows, (mediaId, backend) => {
    if (backend === "google_drive") {
      // Served by the proxy, which needs this contributor's Drive login.
      return options.driveConnected ? `/media/${mediaId}` : null;
    }
    return signed[mediaId] ?? null;
  });
}
