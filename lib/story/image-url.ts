import { getPublicImageUrl } from "@/lib/story/public-image-url";

/**
 * The one resolver every public read site now goes through (Round B — see
 * docs/architecture.md's "Drive upload (slice 3, UI and reads)" section
 * for the full list of sites wired to it this round). For a
 * `supabase`-backend row, this calls getPublicImageUrl() with the exact
 * same argument today's code already passes it — behavior for every
 * contributor who never connects Drive is byte-for-byte unchanged, not
 * merely similar. For a `google_drive`-backend row, it returns the proxy
 * route's own path — never a Drive URL, never a "anyone with the link"
 * share link.
 *
 * Importable from both Server and Client Components, same as
 * getPublicImageUrl() itself (no server-only import here).
 */
export type ImageUrlMedia = {
  id: string;
  storage_backend: "supabase" | "google_drive";
  public_url?: string | null;
};

export function getImageUrl(media: ImageUrlMedia): string | null {
  if (media.storage_backend === "google_drive") {
    return `/media/${media.id}`;
  }
  return getPublicImageUrl(media.public_url ?? null);
}

/**
 * Cover-specific sibling for the card/hero/sub-story sites
 * (components/story/story-card.tsx, components/home/featured-story-slide.tsx,
 * components/home/story-index.tsx, components/story/story-family.tsx), all
 * of which share list_published_stories()'s row shape. `cover_media_id`/
 * `cover_storage_backend` are optional so a caller that never set them
 * (every existing test fixture, from before these two columns existed)
 * falls through to the exact same getPublicImageUrl(cover_image_path) call
 * as today — a supabase cover's rendered URL is unchanged either way.
 */
export type StoryCardCoverFields = {
  cover_image_path: string | null;
  cover_media_id?: string | null;
  cover_storage_backend?: string | null;
};

export function getCardCoverUrl(story: StoryCardCoverFields): string | null {
  if (story.cover_storage_backend === "google_drive" && story.cover_media_id) {
    return `/media/${story.cover_media_id}`;
  }
  return getPublicImageUrl(story.cover_image_path);
}
