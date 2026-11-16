"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronIcon } from "@/components/icons";
import { ResolvingImage } from "@/components/ui/resolving-image";
import { cardPhotoSrc, cardPhotoSrcSet } from "@/lib/story/card-photo-size";

/** Dots shown at once before the row starts sliding (as PhotoCarousel). */
const DOT_WINDOW = 5;

/**
 * A story card's photos, swipeable right in the list (the home page's
 * "Latest stories" and the Stories tab) -- the way a
 * listing app shows a place: native momentum swipe with snap (CSS
 * scroll-snap, the browser's own physics), dots along the bottom, and on
 * desktop previous/next buttons on hover or focus. Every photo is cropped to
 * the card's fixed 4:3 frame, so cards in the list line up.
 *
 * Tapping a photo opens the story, same as tapping anywhere else on the
 * card. The photos are links to it, but kept out of the tab order and the
 * accessibility tree: the card's title link is its one stop for keyboard
 * and screen-reader users, so nothing is announced twice.
 *
 * The frame sits above the card's stretched title link (z-10). Without that,
 * the link's full-card overlay would catch every touch and the photos could
 * never be swiped.
 *
 * My Stories uses it too, with private photos: there each URL is a
 * short-lived signed link minted on demand, so an entry may be `null` (not
 * minted yet -- drawn as the loading sheen, and still counted in the dots)
 * and `onBrowse` fires the first time the reader swipes or steps, which is
 * when My Stories mints the rest.
 */
export function CardPhotos({
  urls,
  href,
  onBrowse,
  loadAll = false,
  eager = false,
  sizes = "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw",
}: {
  urls: (string | null)[];
  href: string;
  /** Called once, the first time the reader swipes or steps through. */
  onBrowse?: () => void;
  /**
   * Load every photo as soon as its URL is known, not when it nears the
   * view. For short-lived signed URLs, which could expire before a lazy
   * image asks for them.
   */
  loadAll?: boolean;
  /**
   * How wide the card is drawn at each breakpoint, so the browser picks the
   * 640, 828 or 1080px card version (lib/story/card-photo-size.ts) instead of
   * the full photo.
   */
  sizes?: string;
  /** First card(s) on the page: load the first photo straight away. */
  eager?: boolean;
}) {
  const t = useTranslations("common.photoLightbox");
  const tImages = useTranslations("editor.images");
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const total = urls.length;
  const onBrowseRef = useRef(onBrowse);
  const browsedRef = useRef(false);
  useEffect(() => {
    onBrowseRef.current = onBrowse;
  });
  function browse() {
    if (browsedRef.current) return;
    browsedRef.current = true;
    onBrowseRef.current?.();
  }

  // Which photo is in view, read off the scroll position. State for the dots
  // only, not a scroll-linked animation.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || total < 2) return;
    let frame = 0;
    const onScroll = () => {
      browse();
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const width = scroller.clientWidth;
        if (width > 0) {
          setActive(
            Math.min(total - 1, Math.round(scroller.scrollLeft / width)),
          );
        }
      });
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      scroller.removeEventListener("scroll", onScroll);
    };
  }, [total]);

  function goTo(index: number) {
    browse();
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const reduce = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    scroller.scrollTo({
      left: index * scroller.clientWidth,
      behavior: reduce ? "auto" : "smooth",
    });
  }

  const windowStart =
    total <= DOT_WINDOW
      ? 0
      : Math.min(Math.max(active - 2, 0), total - DOT_WINDOW);
  const windowEnd = Math.min(total, windowStart + DOT_WINDOW);

  return (
    <div className="group/photos relative z-10 h-full w-full">
      {/* overflow-y-hidden matters on iOS: ResolvingImage's loading scale
          spills a few px, and a vertically scrollable strip would trap the
          page's own vertical scroll (see PhotoCarousel). */}
      <div
        ref={scrollerRef}
        // A finger landing on the strip is the earliest sign of a swipe, so
        // the next photos' URLs are on their way before it starts moving.
        onPointerDown={total > 1 ? browse : undefined}
        className="nf-scroll-x flex h-full w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain"
      >
        {urls.map((url, index) => (
          <Link
            // By position, not URL: on My Stories a slot's URL arrives
            // later (null -> signed URL), and a URL key would rebuild it.
            key={index}
            href={href}
            tabIndex={-1}
            aria-hidden="true"
            draggable={false}
            className="block h-full w-full shrink-0 snap-center snap-always"
          >
            {url ? (
              <ResolvingImage
                src={cardPhotoSrc(url, 1080)}
                srcSet={cardPhotoSrcSet(url)}
                sizes={sizes}
                alt=""
                loading={loadAll || (index === 0 && eager) ? "eager" : "lazy"}
                loadingLabel={tImages("loading")}
                draggable={false}
                wrapperClassName="relative block h-full w-full overflow-hidden"
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="nf-skeleton block h-full w-full rounded-none" />
            )}
          </Link>
        ))}
      </div>

      {total > 1 && (
        <>
          {active > 0 && (
            <button
              type="button"
              tabIndex={-1}
              onClick={() => goTo(active - 1)}
              aria-label={t("previous")}
              className="press absolute top-1/2 left-2 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-black opacity-0 shadow-sm transition-opacity group-hover/photos:opacity-100 md:flex"
            >
              <ChevronIcon className="h-4 w-4 rotate-180" />
            </button>
          )}
          {active < total - 1 && (
            <button
              type="button"
              tabIndex={-1}
              onClick={() => goTo(active + 1)}
              aria-label={t("next")}
              className="press absolute top-1/2 right-2 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-black opacity-0 shadow-sm transition-opacity group-hover/photos:opacity-100 md:flex"
            >
              <ChevronIcon className="h-4 w-4" />
            </button>
          )}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-2.5 flex h-2 items-center justify-center gap-1"
          >
            {urls.slice(windowStart, windowEnd).map((_, i) => {
              const index = windowStart + i;
              const atEdge =
                (index === windowStart && windowStart > 0) ||
                (index === windowEnd - 1 && windowEnd < total);
              return (
                <span
                  key={index}
                  data-active={index === active || undefined}
                  className={`block rounded-full shadow-[0_0_2px_rgba(0,0,0,0.5)] transition-all duration-200 ease-out motion-reduce:transition-none ${
                    atEdge ? "h-1 w-1" : "h-1.5 w-1.5"
                  } ${index === active ? "bg-white" : "bg-white/55"}`}
                />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
