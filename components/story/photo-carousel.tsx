"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronIcon } from "@/components/icons";
import { LightboxPhoto } from "@/components/ui/photo-lightbox";
import { ResolvingImage } from "@/components/ui/resolving-image";

export type CarouselPhoto = {
  id: string;
  /** null while a signed URL is still being minted (preview pages). */
  url: string | null;
  /** Shown in the slide instead of the photo when it could not be loaded. */
  error?: string | null;
  alt: string;
  caption?: string | null;
};

/** Instagram's own bounds: no taller than 4:5, no wider than 1.91:1. */
const MIN_RATIO = 4 / 5;
const MAX_RATIO = 1.91;
/** How many dots show at once before the row starts sliding, as Instagram. */
const DOT_WINDOW = 5;

/**
 * A story's photos as one swipeable frame, the way Instagram shows a post:
 * full-bleed on a phone, one photo at a time, native momentum swipe with
 * snap (CSS scroll-snap -- the browser's own physics, not a JS drag), a
 * "2/5" counter in the corner, and a row of dots underneath that slides
 * along once there are more than five. Every photo shares the frame's
 * shape, taken from the FIRST photo and clamped to 4:5..1.91:1; the rest
 * are cropped to it (object-cover), so the frame never jumps between
 * slides. Tapping a photo still opens the full-screen viewer.
 *
 * Desktop has no swipe, so from md up previous/next buttons appear on
 * hover or focus; the scroller itself is also keyboard-focusable, where the
 * arrow keys scroll it natively.
 *
 * The active slide is tracked with one IntersectionObserver on the scroller
 * (read back as scrollLeft / width) -- state for the counter and dots, not
 * a scroll-linked animation (see DESIGN.md, The CSS-Timeline Rule).
 */
export function PhotoCarousel({ photos }: { photos: CarouselPhoto[] }) {
  const t = useTranslations("common.photoLightbox");
  const tImages = useTranslations("editor.images");
  const scrollerRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [active, setActive] = useState(0);
  const [ratio, setRatio] = useState(1);
  const total = photos.length;
  const firstUrl = photos[0]?.url ?? null;

  // Which slide is mostly in view.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || total < 2) return;
    // Very old engines: the swipe still works, only the counter/dots stay put.
    if (typeof IntersectionObserver === "undefined") return;
    // The observer only says "a slide crossed the threshold"; which slide is
    // current is read off the scroll position itself, so a burst of entries
    // (every slide reported at once on first observe) can't pick the wrong one.
    const observer = new IntersectionObserver(
      () => {
        const width = scroller.clientWidth;
        if (width > 0) {
          setActive(
            Math.min(total - 1, Math.round(scroller.scrollLeft / width)),
          );
        }
      },
      { root: scroller, threshold: 0.6 },
    );
    for (const slide of slideRefs.current) if (slide) observer.observe(slide);
    return () => observer.disconnect();
  }, [total]);

  // The frame takes the first photo's shape once its size is known.
  useEffect(() => {
    const img = slideRefs.current[0]?.querySelector("img");
    if (!img) return;
    const apply = () => {
      if (img.naturalWidth && img.naturalHeight) {
        const r = img.naturalWidth / img.naturalHeight;
        setRatio(Math.min(MAX_RATIO, Math.max(MIN_RATIO, r)));
      }
    };
    if (img.complete) apply();
    img.addEventListener("load", apply);
    return () => img.removeEventListener("load", apply);
  }, [firstUrl]);

  function goTo(index: number) {
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

  if (total === 0) return null;

  const caption = photos[active]?.caption;
  const anyCaption = photos.some((p) => p.caption);

  // Instagram's dot row: at most five at a time, the window sliding with
  // the active photo, and the dots at a window edge that has more beyond it
  // drawn smaller.
  const windowStart =
    total <= DOT_WINDOW
      ? 0
      : Math.min(Math.max(active - 2, 0), total - DOT_WINDOW);
  const windowEnd = Math.min(total, windowStart + DOT_WINDOW);

  return (
    <section
      aria-roledescription="carousel"
      aria-label={t("carouselLabel")}
      className="group -mx-4 sm:mx-0"
    >
      <div
        className="relative overflow-hidden bg-surface-muted sm:rounded-lg"
        style={{ aspectRatio: String(ratio) }}
      >
        {/* overflow-y-hidden is load-bearing: overflow-x:auto alone computes
            overflow-y to auto too, and a lazy slide's scale(1.03) loading
            state (ResolvingImage) spills a few px past the frame. That made
            the scroller vertically scrollable, and iOS latched a vertical
            swipe onto it -- the page stopped scrolling at the photos. */}
        <div
          ref={scrollerRef}
          tabIndex={total > 1 ? 0 : undefined}
          aria-label={total > 1 ? t("carouselLabel") : undefined}
          className="nf-scroll-x flex h-full w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
        >
          {photos.map((photo, index) => (
            <div
              key={photo.id}
              ref={(el) => {
                slideRefs.current[index] = el;
              }}
              role="group"
              aria-roledescription="slide"
              aria-label={t("counter", { current: index + 1, total })}
              className="relative h-full w-full shrink-0 snap-center snap-always"
            >
              {photo.url ? (
                <LightboxPhoto
                  url={photo.url}
                  alt={photo.alt}
                  caption={photo.caption}
                  className="block h-full w-full"
                >
                  <ResolvingImage
                    src={photo.url}
                    alt={photo.alt}
                    loading={index === 0 ? "eager" : "lazy"}
                    loadingLabel={tImages("loading")}
                    wrapperClassName="relative block h-full w-full overflow-hidden"
                    className="h-full w-full object-cover"
                  />
                </LightboxPhoto>
              ) : photo.error ? (
                <div className="flex h-full w-full items-center justify-center p-4 text-center text-sm text-muted-foreground">
                  {photo.error}
                </div>
              ) : (
                <div
                  role="status"
                  aria-label={tImages("loading")}
                  className="nf-skeleton h-full w-full rounded-none"
                />
              )}
            </div>
          ))}
        </div>

        {total > 1 && (
          <>
            {/* The "2/5" pill, top right, as on Instagram. Decorative: each
                slide already announces its own position. */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-3 right-3 rounded-full bg-black/60 px-2.5 py-1 font-mono text-xs leading-none text-white tabular-nums"
            >
              {`${active + 1}/${total}`}
            </span>

            {active > 0 && (
              <button
                type="button"
                onClick={() => goTo(active - 1)}
                aria-label={t("previous")}
                className="press absolute top-1/2 left-3 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-black shadow-sm opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 md:flex"
              >
                <ChevronIcon className="h-4 w-4 rotate-180" />
              </button>
            )}
            {active < total - 1 && (
              <button
                type="button"
                onClick={() => goTo(active + 1)}
                aria-label={t("next")}
                className="press absolute top-1/2 right-3 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-black shadow-sm opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 md:flex"
              >
                <ChevronIcon className="h-4 w-4" />
              </button>
            )}
          </>
        )}
      </div>

      {total > 1 && (
        <div
          aria-hidden="true"
          className="mt-2.5 flex h-2 items-center justify-center gap-1"
        >
          {photos.slice(windowStart, windowEnd).map((photo, i) => {
            const index = windowStart + i;
            const isActive = index === active;
            const atEdge =
              (index === windowStart && windowStart > 0) ||
              (index === windowEnd - 1 && windowEnd < total);
            return (
              <span
                key={photo.id}
                data-active={isActive || undefined}
                className={`block rounded-full transition-all duration-200 ease-out motion-reduce:transition-none ${
                  atEdge ? "h-1 w-1" : "h-1.5 w-1.5"
                } ${isActive ? "bg-accent" : "bg-foreground/25"}`}
              />
            );
          })}
        </div>
      )}

      {anyCaption && (
        <p className="mt-2 min-h-4 px-4 text-xs text-muted-foreground sm:px-0">
          {caption}
        </p>
      )}
    </section>
  );
}
