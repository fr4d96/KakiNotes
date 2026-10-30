"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { BackLink } from "@/components/back-link";
import { ChevronIcon } from "@/components/icons";
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
 * Mobile-first (Rule 18): each story is a collapsed row (cover, title,
 * status, photo count); opening one shows only that story's photos, two
 * columns on a phone, and closes any other -- one story's photos at a time.
 * A closed story mounts no photos, so nothing loads until it is opened.
 * Every status is written out as text, never hover-only or colour-only
 * (Rule 19).
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
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-5xl px-4 pt-4 pb-12 sm:px-6 sm:py-16">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <BackLink />
            <h1 className="journiq-heading text-[2.4rem] max-md:sr-only">
              {t("title")}
            </h1>
          </div>
          <p className="mt-1 text-sm text-foreground/65">
            {total > 0
              ? t("summary", { photos: total, stories: stories.length })
              : t("subtitle")}
          </p>
        </div>
      </div>

      {total === 0 ? (
        <p className="mt-10 rounded-md border border-border-subtle p-6 text-sm text-foreground/70">
          {t("empty")}
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {stories.map((story) => (
            <StorySection
              key={story.storyId}
              story={story}
              driveConnected={driveConnected}
              open={openId === story.storyId}
              onToggle={() =>
                setOpenId((current) =>
                  current === story.storyId ? null : story.storyId,
                )
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function StorySection({
  story,
  driveConnected,
  open,
  onToggle,
}: {
  story: MyPhotoStory;
  driveConnected: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations("myPhotos");
  const title = story.title?.trim() || t("untitledStory");
  const panelId = `story-photos-${story.storyId}`;
  const rowRef = useRef<HTMLLIElement>(null);
  const [coverFailed, setCoverFailed] = useState(false);
  const cover = coverFailed ? null : (story.photos[0]?.thumbnailUrl ?? null);

  function toggle() {
    onToggle();
    if (open) return;
    // Opening this one closes the one above it, which can pull this row up
    // and off screen -- bring it back into view once the layout settles.
    requestAnimationFrame(() => {
      const reduce = window.matchMedia?.(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      rowRef.current?.scrollIntoView?.({
        block: "nearest",
        behavior: reduce ? "auto" : "smooth",
      });
    });
  }

  return (
    <li
      ref={rowRef}
      className="scroll-mt-20 rounded-lg border border-border-subtle bg-surface"
    >
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={toggle}
          className="flex min-h-16 w-full items-center gap-3 p-2 pr-3 text-left"
        >
          <span className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-surface-muted">
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL or the Drive proxy, not an optimizable static asset
              <img
                src={cover}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover"
                onError={() => setCoverFailed(true)}
              />
            ) : null}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{title}</span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <StatusBadge status={story.lifecycleStatus} />
              <span className="text-xs font-normal text-foreground/55">
                {t("photoCount", { count: story.photos.length })}
              </span>
            </span>
          </span>
          <ChevronIcon
            className={`h-4 w-4 shrink-0 text-foreground/60 transition-transform ${open ? "rotate-90" : ""}`}
          />
        </button>
      </h2>
      {open ? (
        <ul
          id={panelId}
          className="grid grid-cols-2 gap-3 border-t border-border-subtle p-3 sm:grid-cols-3 lg:grid-cols-4"
        >
          {story.photos.map((photo, index) => (
            <PhotoCard
              key={photo.mediaId}
              photo={photo}
              label={t("photoLabel", { index: index + 1, story: title })}
              driveConnected={driveConnected}
            />
          ))}
        </ul>
      ) : null}
    </li>
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
        {photo.hasFullCopy && (
          <span className="font-medium text-foreground/80">
            {" "}
            · {t("fullQuality")}
          </span>
        )}
        {!photo.inCurrentVersion && (
          <span className="text-foreground/50"> · {t("earlierVersion")}</span>
        )}
      </p>

      {needsReconnect ? (
        <Link
          href="/account#drive"
          className="press inline-flex min-h-11 items-center justify-center rounded-full border border-border-subtle px-3 text-center text-xs font-medium"
        >
          {t("reconnect")}
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => void download()}
          disabled={downloading}
          aria-label={
            photo.hasFullCopy
              ? t("downloadFullLabel", { photo: label })
              : t("downloadLabel", { photo: label })
          }
          className="press inline-flex min-h-11 items-center justify-center rounded-full border border-border-subtle px-3 text-xs font-medium disabled:opacity-60"
        >
          {downloading
            ? t("preparing")
            : photo.hasFullCopy
              ? t("downloadFull")
              : t("download")}
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
