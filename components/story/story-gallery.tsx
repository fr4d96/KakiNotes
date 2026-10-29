import { getImageUrl } from "@/lib/story/image-url";
import { LightboxPhoto } from "@/components/ui/photo-lightbox";

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

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {images.map((image) => {
        const url = getImageUrl({
          id: image.media_id,
          storage_backend: image.storage_backend ?? "supabase",
          public_url: image.public_url,
        });
        if (!url) return null;
        return (
          <figure
            key={image.media_id}
            className="overflow-hidden rounded-lg border border-border-subtle bg-surface-muted"
          >
            <LightboxPhoto
              url={url}
              alt={image.decorative ? "" : (image.alt_text ?? "")}
              caption={image.caption}
              className="block w-full"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- public bucket URLs are content-addressed, not a Next.js image-optimizable source list */}
              <img
                src={url}
                alt={image.decorative ? "" : (image.alt_text ?? "")}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
            </LightboxPhoto>
            {image.caption ? (
              <figcaption className="p-2 text-xs text-foreground/60">
                {image.caption}
              </figcaption>
            ) : null}
          </figure>
        );
      })}
    </div>
  );
}
