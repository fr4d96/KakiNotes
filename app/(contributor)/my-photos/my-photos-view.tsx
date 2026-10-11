"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { LightboxPhoto } from "@/components/ui/photo-lightbox";
import { StatusBadge } from "@/app/(contributor)/my-stories/status-badge";
import { mintPreviewUrlAction } from "@/app/(contributor)/stories/[id]/media-actions";
import { getPhotoDownloadUrlAction } from "@/app/(contributor)/my-photos/actions";
import type { MyPhoto, MyPhotoStory } from "@/lib/story/my-photos";

/**
 * My Photos (docs/google-drive-integration.md section 7): every photo on
 * the contributor's stories, grouped by story, each with where it lives and
 * its own Download button. Per-photo downloads only for now -- "Download
 * all" is a later slice.
 *
 * Mobile-first (Rule 18): two columns on a phone. Every status is written
 * out as text, never hover-only or colour-only (Rule 19).
 */
export function MyPhotosView({
  stories,
  driveConnected,
}: {
  stories: MyPhotoStory[];
  driveConnected: boolean;
}) {
  const t = useTranslations("myPhotos");
  const total = stories.reduce((n, story) => n + story.photos.length, 0);

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="journiq-heading text-[2.4rem]">{t("title")}</h1>
          <p className="mt-1 text-sm text-foreground/65">
            {total > 0
              ? t("summary", { photos: total, stories: stories.length })
              : t("subtitle")}
          </p>
        </div>
        <Link
          href="/my-stories"
          className="rounded-md border border-border-subtle px-3 py-1.5 text-sm font-medium"
        >
          {t("backToMyStories")}
        </Link>
      </div>

      {total === 0 ? (
        <p className="mt-10 rounded-md border border-border-subtle p-6 text-sm text-foreground/70">
          {t("empty")}
        </p>
      ) : (
        <div className="mt-8 space-y-10">
          {stories.map((story) => (
            <StorySection
              key={story.storyId}
              story={story}
              driveConnected={driveConnected}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StorySection({
  story,
  driveConnected,
}: {
  story: MyPhotoStory;
  driveConnected: boolean;
}) {
  const t = useTranslations("myPhotos");
  const title = story.title?.trim() || t("untitledStory");
  const headingId = `story-photos-${story.storyId}`;

  return (
    <section aria-labelledby={headingId}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 id={headingId} className="text-lg font-semibold">
          {title}
        </h2>
        <StatusBadge status={story.lifecycleStatus} />
        <span className="text-xs text-foreground/55">
          {t("photoCount", { count: story.photos.length })}
        </span>
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {story.photos.map((photo, index) => (
          <PhotoCard
            key={photo.mediaId}
            photo={photo}
            label={t("photoLabel", { index: index + 1, story: title })}
            driveConnected={driveConnected}
          />
        ))}
      </ul>
    </section>
  );
}

function PhotoCard({
  photo,
  label,
  driveConnected,
}: {
  photo: MyPhoto;
  label: string;
  driveConnected: boolean;
}) {
  const t = useTranslations("myPhotos");
  const [thumbnail, setThumbnail] = useState(photo.thumbnailUrl);
  const [retried, setRetried] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onDrive = photo.storageBackend === "google_drive";
  const needsReconnect = onDrive && !driveConnected;

  // A signed thumbnail URL can expire before a lazy image loads. Ask for a
  // fresh one once, through the same authorized action the editor uses.
  async function retryThumbnail() {
    if (retried || onDrive) {
      setThumbnail(null);
      return;
    }
    setRetried(true);
    const result = await mintPreviewUrlAction(photo.mediaId);
    setThumbnail("url" in result ? result.url : null);
  }

  async function download() {
    setDownloading(true);
    setError(null);
    const result = await getPhotoDownloadUrlAction(photo.mediaId);
    setDownloading(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    // Both URLs answer with Content-Disposition: attachment, so following
    // one saves the file and leaves this page where it is.
    const link = document.createElement("a");
    link.href = result.url;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  return (
    <li className="flex flex-col gap-1.5">
      <div className="relative aspect-square overflow-hidden rounded-md border border-border-subtle bg-surface-muted">
        {thumbnail ? (
          <LightboxPhoto
            url={thumbnail}
            alt={photo.altText ?? ""}
            caption={photo.caption}
            className="block h-full w-full"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL or the Drive proxy, not an optimizable static asset */}
            <img
              src={thumbnail}
              alt={photo.altText ?? ""}
              loading="lazy"
              className="h-full w-full object-cover"
              onError={() => void retryThumbnail()}
            />
          </LightboxPhoto>
        ) : (
          <div className="flex h-full w-full items-center justify-center px-3 text-center text-xs text-foreground/60">
            {needsReconnect ? t("reconnectToSee") : t("cantShow")}
          </div>
        )}
      </div>

      <p className="text-xs text-foreground/65">
        {onDrive ? t("whereDrive") : t("whereKakinotes")}
        {!photo.inCurrentVersion && (
          <span className="text-foreground/50"> · {t("earlierVersion")}</span>
        )}
      </p>

      {needsReconnect ? (
        <Link
          href="/account#drive"
          className="rounded-md border border-border-subtle px-2 py-1.5 text-center text-xs font-medium"
        >
          {t("reconnect")}
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => void download()}
          disabled={downloading}
          aria-label={t("downloadLabel", { photo: label })}
          className="rounded-md border border-border-subtle px-2 py-1.5 text-xs font-medium disabled:opacity-60"
        >
          {downloading ? t("preparing") : t("download")}
        </button>
      )}

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </li>
  );
}
