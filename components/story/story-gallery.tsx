import { getImageUrl } from "@/lib/story/image-url";
import { PhotoCarousel } from "@/components/story/photo-carousel";

type GalleryImage = {
  media_id: string;
  // Despite the RPC's column name, get_published_story_media() actually
  // returns the raw storage path (approved_public_storage_path) for a
  // supabase row -- run through getImageUrl() below, same as every other
  // public image on this site. A google_drive row has `public_url: null`
  // and `storage_backend: "google_drive"`; getImageUrl() routes that one
  // to the proxy (/media/<id>) instead.
  public_url: string | null;
  // Optional (round A review MUST-FIX 1 / round B): absent on an older
  // fixture, which getImageUrl() treats as "supabase" via its own default.
  storage_backend?: "supabase" | "google_drive";
  alt_text: string | null;
  caption: string | null;
  decorative: boolean;
  sort_order: number;
  is_cover: boolean;
};

/**
 * The public gallery, placed distinctly from the body text (design-brief
 * "Story detail layout"). Shows only images NOT already placed inline via
 * an "image" content_json block -- the caller (app/(public)/stories/[id]/
 * page.tsx) filters those out before passing `images` here, so nothing
 * appears twice.
 */
export function StoryGallery({ images }: { images: GalleryImage[] }) {
  if (images.length === 0) return null;

  // An Instagram-style carousel (components/story/photo-carousel.tsx): one
  // swipeable frame with dots, rather than a grid of every photo at once.
  const photos = images.flatMap((image) => {
    const url = getImageUrl({
      id: image.media_id,
      storage_backend: image.storage_backend ?? "supabase",
      public_url: image.public_url,
    });
    if (!url) return [];
    return [
      {
        id: image.media_id,
        url,
        alt: image.decorative ? "" : (image.alt_text ?? ""),
        caption: image.caption,
      },
    ];
  });

  return <PhotoCarousel photos={photos} />;
}
