"use client";

import { useEffect, useState } from "react";
import { CardPhotos } from "@/components/story/card-photos";
import { StoryCoverFallback } from "@/components/story/story-cover-fallback";
import { getPreviewUrl } from "@/lib/story/preview-url-client";

/**
 * Every photo on a My Stories card, swipeable in place -- drafts and
 * published alike, the same strip the public cards use (CardPhotos).
 *
 * The photos are private until approved (Rule 13), so each one reaches the
 * browser only as a short-lived signed URL, minted per id after
 * authorize_story_media_preview() re-checks the caller (getPreviewUrl ->
 * mintPreviewUrlsAction). `mediaIds` come from list_my_stories() -- ids
 * only, cover first.
 *
 * Only the cover is minted up front, so a page of cards costs what it did
 * before. The rest are minted the first time the contributor swipes the
 * card (CardPhotos' onBrowse), all at once in one batched call, and load
 * straight away (loadAll) so none can sit unrequested past its URL's
 * 120-second life. The dots count every photo from the start. A photo that
 * can't be shown (still processing, or no longer authorized) is dropped.
 */
export function MyStoryPhotos({
  mediaIds,
  href,
  sizes,
}: {
  mediaIds: string[];
  href: string;
  sizes?: string;
}) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
  const [browsing, setBrowsing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const wanted = browsing ? mediaIds : mediaIds.slice(0, 1);
    for (const id of wanted) {
      if (urls[id] || failed.has(id)) continue;
      void getPreviewUrl(id).then((result) => {
        if (cancelled) return;
        if ("url" in result) {
          setUrls((prev) => ({ ...prev, [id]: result.url }));
        } else {
          setFailed((prev) => new Set(prev).add(id));
        }
      });
    }
    return () => {
      cancelled = true;
    };
    // urls/failed are read only to skip ids already settled; re-running on
    // each of their updates would just find nothing new to ask for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaIds, browsing]);

  const shown = mediaIds.filter((id) => !failed.has(id));
  if (shown.length === 0) {
    return (
      <div className="relative h-full w-full bg-surface-muted">
        <StoryCoverFallback sizes={sizes ?? "50vw"} />
      </div>
    );
  }

  return (
    <CardPhotos
      urls={shown.map((id) => urls[id] ?? null)}
      href={href}
      sizes={sizes}
      loadAll
      onBrowse={() => setBrowsing(true)}
    />
  );
}
