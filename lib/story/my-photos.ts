import "server-only";
import { createClient } from "@/lib/supabase/server";
import { mintMediaPreviewSignedUrls } from "@/lib/story/image-pipeline";
import { listMyStories } from "@/lib/story/contributor-queries";
import { DEFAULT_COUNTRY_SLUG } from "@/lib/story/countries";

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
  /** A full-resolution copy is kept in the contributor's Drive. */
  hasFullCopy: boolean;
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
    has_full_copy?: boolean | null;
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
      hasFullCopy: row.has_full_copy === true,
      thumbnailUrl: thumbnailFor(row.media_id, backend),
    });
  }
  return stories;
}

/**
 * Keeps only the rows whose story belongs to `countrySlug`. list_my_photos()
 * returns no country, so each story's comes from list_my_stories()'s
 * country_slug (same ownership rule); a story without one, or missing from
 * that list, counts as New Zealand -- the same fallback My Stories uses.
 */
export function rowsInCountry<T extends { story_id: string }>(
  rows: readonly T[],
  storyCountries: ReadonlyMap<string, string | null>,
  countrySlug: string,
): T[] {
  return rows.filter(
    (row) =>
      (storyCountries.get(row.story_id) ?? DEFAULT_COUNTRY_SLUG) ===
      countrySlug,
  );
}

export async function listMyPhotos(options: {
  driveConnected: boolean;
  /**
   * The country chosen in the top bar (kakinotes-country cookie). A display
   * filter only: which photos are the caller's is still decided by the RPCs
   * (Engineering Rule 2).
   */
  countrySlug: string;
}): Promise<MyPhotoStory[]> {
  const supabase = await createClient();
  const [{ data, error }, myStories] = await Promise.all([
    supabase.rpc("list_my_photos"),
    listMyStories(),
  ]);
  if (error) throw error;
  const rows = rowsInCountry(
    data ?? [],
    new Map(myStories.map((s) => [s.id, s.country_slug ?? null] as const)),
    options.countrySlug,
  );

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
