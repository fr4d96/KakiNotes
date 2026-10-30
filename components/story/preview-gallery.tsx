"use client";

import { useEffect, useState } from "react";
import type { PreviewableMediaItem } from "@/lib/story/contributor-queries";
import { getPreviewUrl } from "@/lib/story/preview-url-client";
import { PhotoCarousel } from "@/components/story/photo-carousel";

/**
 * Mints a short-lived signed URL per image, client-side, only after the
 * corresponding Server Action has independently re-checked
 * authorize_story_media_preview() — see media-actions.ts. Nothing here
 * ever receives a raw storage path; the props are exactly what
 * get_story_preview() (or, for a moderator, get_story_for_moderator's own
 * path-free media list — see PreviewableMediaItem) returns: media_id +
 * presentation fields only.
 *
 * All the ids are requested up front, in one pass, through
 * lib/story/preview-url-client.ts, which folds them (together with whatever
 * PreviewContentBody asks for in the same tick) into a single batched
 * Server Action. The earlier `for … await` here meant one serial round
 * trip per image, which on a photo-heavy story was the whole reason the
 * review page felt like it was "still processing images".
 */
export function PreviewGallery({ media }: { media: PreviewableMediaItem[] }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    for (const item of media) {
      if (
        item.processingState === "pending_upload" ||
        item.processingState === "uploaded" ||
        item.processingState === "processing"
      ) {
        continue; // not ready to preview yet
      }
      void getPreviewUrl(item.mediaId).then((result) => {
        if (cancelled) return;
        if ("url" in result) {
          setUrls((prev) => ({ ...prev, [item.mediaId]: result.url }));
        } else {
          setErrors((prev) => ({ ...prev, [item.mediaId]: result.error }));
        }
      });
    }
    return () => {
      cancelled = true;
    };
  }, [media]);

  if (media.length === 0) return null;

  const sorted = [...media].sort((a, b) => a.sortOrder - b.sortOrder);

  // One swipeable frame, the same carousel the published page uses, so the
  // preview really is what readers will see.
  return (
    <PhotoCarousel
      photos={sorted.map((item) => ({
        id: item.mediaId,
        url: urls[item.mediaId] ?? null,
        error: errors[item.mediaId] ?? null,
        alt: item.altText ?? "",
        caption: item.caption,
      }))}
    />
  );
}
