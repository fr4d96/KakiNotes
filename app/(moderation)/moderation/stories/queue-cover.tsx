"use client";

import { useEffect, useState } from "react";
import { getPreviewUrl } from "@/lib/story/preview-url-client";
import { ResolvingImage } from "@/components/ui/resolving-image";
import { StoryCoverFallback } from "@/components/story/story-cover-fallback";

/**
 * A queue row's cover. The URL is minted client-side, per image, after
 * authorize_story_media_preview() has agreed (Engineering Rule 13), through
 * the same batching front door as the review screen's gallery -- so a page
 * of rows is one request. A photo that can't be shown (not authorized, or a
 * failed mint) settles on the app's no-photo drawing rather than shimmering
 * forever.
 */
export function QueueCover({ mediaId }: { mediaId: string | null }) {
  const [minted, setMinted] = useState<{
    mediaId: string;
    url: string | null;
  } | null>(null);

  useEffect(() => {
    if (!mediaId) return;
    let cancelled = false;
    void getPreviewUrl(mediaId).then((result) => {
      if (cancelled) return;
      setMinted({ mediaId, url: "url" in result ? result.url : null });
    });
    return () => {
      cancelled = true;
    };
  }, [mediaId]);

  const current = minted && minted.mediaId === mediaId ? minted : null;

  return (
    <span className="relative block h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-surface-muted">
      {!mediaId || (current && !current.url) ? (
        <StoryCoverFallback sizes="80px" />
      ) : current?.url ? (
        <ResolvingImage
          src={current.url}
          alt=""
          loadingLabel="Loading photo"
          loading="lazy"
          wrapperClassName="relative block h-full w-full"
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="nf-skeleton block h-full w-full rounded-none" />
      )}
    </span>
  );
}
