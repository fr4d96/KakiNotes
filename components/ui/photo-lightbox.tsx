"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { ChevronIcon, CloseIcon } from "@/components/icons";

/**
 * Full-screen photo viewer ("lightbox") for every story photo on the site.
 *
 * Two halves:
 *
 * - `PhotoLightboxProvider` sits once in the root layout and owns the single
 *   <dialog> that shows a photo large. It also keeps a registry of every
 *   `LightboxPhoto` currently mounted on the page.
 * - `LightboxPhoto` wraps any <img> in a button. Clicking it opens the
 *   viewer at that photo; the viewer then pages through every OTHER
 *   registered photo on the page, in document order.
 *
 * Why a registry instead of passing an array down: story photos come from
 * two unrelated components (inline `![[mediaId]]` embeds rendered by
 * react-markdown, and the separate gallery grid). Sorting the registry by
 * DOM position at open time gives "body photos first, then gallery" for
 * free, with no prop plumbing through the Markdown renderer.
 *
 * The <dialog> is the same native-modal mechanism as confirm-dialog.tsx and
 * auth-modal.tsx: showModal() traps focus, Escape closes (with the zoom-out),
 * a tap on the dark ground around a photo closes it, and a finger-following
 * swipe, the buttons or ← / → move between photos. See LightboxDialog.
 *
 * No provider mounted (a component test rendering a gallery on its own):
 * `LightboxPhoto` renders a plain sized wrapper instead of a button, so
 * nothing depends on the provider being there.
 */

export type LightboxPhotoData = {
  url: string;
  alt: string;
  caption?: string | null;
};

type RegistryEntry = LightboxPhotoData & { element: HTMLElement };

type LightboxContextValue = {
  register: (id: string, entry: RegistryEntry) => void;
  unregister: (id: string) => void;
  open: (id: string) => void;
};

const LightboxContext = createContext<LightboxContextValue | null>(null);

/** How far a downward drag must travel (px) to close the viewer. */
const DISMISS_DRAG_PX = 110;
/** The app's own ease (DESIGN.md, Touch & navigation motion). */
const EASE = "cubic-bezier(0.2, 0.75, 0.25, 1)";

type Session = {
  photos: LightboxPhotoData[];
  /** The on-page photo each one was opened from, for the zoom in and out. */
  elements: HTMLElement[];
  index: number;
};

export function PhotoLightboxProvider({ children }: { children: ReactNode }) {
  const registry = useRef(new Map<string, RegistryEntry>());
  const [session, setSession] = useState<Session | null>(null);

  const register = useCallback((id: string, entry: RegistryEntry) => {
    registry.current.set(id, entry);
  }, []);
  const unregister = useCallback((id: string) => {
    registry.current.delete(id);
  }, []);

  const open = useCallback((id: string) => {
    const clicked = registry.current.get(id);
    if (!clicked) return;
    // Snapshot every registered photo in document order. compareDocumentPosition
    // is the DOM's own "which comes first" — it doesn't care which React
    // subtree each photo was rendered from.
    const ordered = [...registry.current.entries()].sort(([, a], [, b]) => {
      if (a.element === b.element) return 0;
      const position = a.element.compareDocumentPosition(b.element);
      return position & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });
    const index = Math.max(
      0,
      ordered.findIndex(([entryId]) => entryId === id),
    );
    setSession({
      photos: ordered.map(([, { url, alt, caption }]) => ({
        url,
        alt,
        caption,
      })),
      elements: ordered.map(([, { element }]) => element),
      index,
    });
  }, []);

  const close = useCallback(() => setSession(null), []);

  // Clamped, not wrapped: the photos sit side by side on a swipe track, as
  // in the iPhone Photos app, so the ends are real ends.
  const goTo = useCallback((index: number) => {
    setSession((current) => {
      if (!current) return current;
      const next = Math.min(current.photos.length - 1, Math.max(0, index));
      return next === current.index ? current : { ...current, index: next };
    });
  }, []);

  const contextValue = useMemo(
    () => ({ register, unregister, open }),
    [register, unregister, open],
  );

  return (
    <LightboxContext.Provider value={contextValue}>
      {children}
      <LightboxDialog session={session} onClose={close} onGoTo={goTo} />
    </LightboxContext.Provider>
  );
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

/** Can this element run Web Animations (jsdom can't)? */
function canAnimate(el: Element | null | undefined): el is HTMLElement {
  return !!el && typeof (el as HTMLElement).animate === "function";
}

/**
 * The transform that lays `photo` (at rest, full screen) over `source` (the
 * photo on the page): centre on it, scaled to fit inside it.
 */
function transformOnto(photo: DOMRect, source: DOMRect): string | null {
  if (!photo.width || !photo.height || !source.width || !source.height) {
    return null;
  }
  const scale = Math.min(
    source.width / photo.width,
    source.height / photo.height,
  );
  const dx = source.left + source.width / 2 - (photo.left + photo.width / 2);
  const dy = source.top + source.height / 2 - (photo.top + photo.height / 2);
  return `translate(${dx}px, ${dy}px) scale(${scale})`;
}

/** Is the on-page photo actually on screen to zoom back into? */
function onScreen(rect: DOMRect) {
  return (
    rect.width > 0 &&
    rect.bottom > 0 &&
    rect.right > 0 &&
    rect.top < window.innerHeight &&
    rect.left < window.innerWidth
  );
}

/**
 * The viewer, modelled on the iPhone Photos app:
 *
 * - Opening zooms the tapped photo out of its place on the page to full
 *   screen while the black ground fades up; closing zooms the current
 *   photo back into its own place (or, if that is off screen, settles it
 *   away with a small scale and fade).
 * - Every photo sits on one horizontal CSS scroll-snap track, so a swipe
 *   follows the finger with the browser's own momentum and snaps to the next
 *   photo. Buttons and ← / → move along the same track.
 * - Dragging a photo DOWN pulls it after the finger while the ground fades;
 *   let go past DISMISS_DRAG_PX to close, short of it to spring back. The
 *   track is `touch-action: pan-x`, so vertical drags arrive as pointer
 *   events instead of scrolling.
 *
 * All motion is Web Animations on transform/opacity, and none of it runs
 * under prefers-reduced-motion (or where Element.animate is missing).
 */
function LightboxDialog({
  session,
  onClose,
  onGoTo,
}: {
  session: Session | null;
  onClose: () => void;
  onGoTo: (index: number) => void;
}) {
  const t = useTranslations("common.photoLightbox");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const groundRef = useRef<HTMLDivElement>(null);
  const chromeRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<(HTMLElement | null)[]>([]);
  const closing = useRef(false);
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    mode: "pending" | "dismiss" | "none";
    dy: number;
  } | null>(null);
  // A press that turned into a drag must not also read as a tap-to-close.
  const dragged = useRef(false);

  const isOpen = session !== null;
  const total = session?.photos.length ?? 0;
  const hasMany = total > 1;
  const index = session?.index ?? 0;
  const photo = session?.photos[index] ?? null;

  const currentImg = useCallback(
    (i: number) => slideRefs.current[i]?.querySelector("img") ?? null,
    [],
  );

  // Open: show the dialog, park the track on the tapped photo, zoom it in.
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!isOpen) {
      if (dialog.open) dialog.close();
      return;
    }
    if (dialog.open) return;
    closing.current = false;
    dialog.showModal();

    const track = trackRef.current;
    if (track && track.clientWidth) {
      track.scrollLeft = index * track.clientWidth;
    }
    if (prefersReducedMotion()) return;

    const ground = groundRef.current;
    const chrome = chromeRef.current;
    if (canAnimate(ground)) {
      ground.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 260,
        easing: "ease-out",
      });
    }
    if (canAnimate(chrome)) {
      chrome.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 220,
        delay: 120,
        easing: "ease-out",
        fill: "backwards",
      });
    }
    const img = currentImg(index);
    const source = session?.elements[index];
    const zoomIn = () => {
      if (!canAnimate(img) || !source) return;
      const from = transformOnto(
        img.getBoundingClientRect(),
        source.getBoundingClientRect(),
      );
      if (!from) return;
      img.animate([{ transform: from }, { transform: "none" }], {
        duration: 340,
        easing: EASE,
      });
    };
    if (img && !img.complete) {
      img.addEventListener("load", zoomIn, { once: true });
    } else {
      zoomIn();
    }
    // Only on the transition to open; later index changes are swipes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Buttons and arrow keys move the index; carry the track along with it.
  useEffect(() => {
    const track = trackRef.current;
    if (!isOpen || !track || !track.clientWidth) return;
    const target = index * track.clientWidth;
    if (Math.abs(track.scrollLeft - target) < 2) return;
    if (typeof track.scrollTo === "function") {
      track.scrollTo({
        left: target,
        behavior: prefersReducedMotion() ? "auto" : "smooth",
      });
    } else {
      track.scrollLeft = target;
    }
  }, [index, isOpen]);

  // showModal() makes the rest of the page inert but does not stop it
  // scrolling under the viewer; lock it for as long as we're open.
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = previous;
    };
  }, [isOpen]);

  /** Zoom the current photo back to its place on the page, then close. */
  const requestClose = useCallback(() => {
    const dialog = dialogRef.current;
    if (!dialog || closing.current) return;
    closing.current = true;
    const finish = () => {
      if (dialog.open) dialog.close();
      onClose();
    };
    if (prefersReducedMotion()) return finish();

    const img = currentImg(index);
    const ground = groundRef.current;
    const chrome = chromeRef.current;
    const source = session?.elements[index];
    const animations: Animation[] = [];

    if (canAnimate(img)) {
      const sourceRect = source?.isConnected
        ? source.getBoundingClientRect()
        : null;
      // Measure the photo's resting box (a drag may have moved it).
      const current = img.style.transform;
      img.style.transform = "";
      const restRect = img.getBoundingClientRect();
      img.style.transform = current;
      const to =
        sourceRect && onScreen(sourceRect)
          ? transformOnto(restRect, sourceRect)
          : null;
      animations.push(
        img.animate(
          to
            ? [{ transform: current || "none" }, { transform: to }]
            : [
                { transform: current || "none", opacity: 1 },
                { transform: "scale(0.92)", opacity: 0 },
              ],
          { duration: 280, easing: EASE, fill: "forwards" },
        ),
      );
    }
    if (canAnimate(ground)) {
      animations.push(
        ground.animate(
          [{ opacity: getComputedStyle(ground).opacity }, { opacity: 0 }],
          { duration: 260, easing: "ease-in", fill: "forwards" },
        ),
      );
    }
    if (canAnimate(chrome)) {
      animations.push(
        chrome.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: 140,
          fill: "forwards",
        }),
      );
    }
    if (animations.length === 0) return finish();
    Promise.all(animations.map((a) => a.finished))
      .catch(() => {})
      .then(() => {
        finish();
        for (const a of animations) a.cancel();
        if (img) img.style.transform = "";
        if (ground) ground.style.opacity = "";
      });
  }, [currentImg, index, onClose, session]);

  // A swipe settles on a photo: make it the current one.
  const scrollFrame = useRef<number | null>(null);
  const onTrackScroll = () => {
    if (scrollFrame.current !== null) return;
    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = null;
      const track = trackRef.current;
      if (!track || !track.clientWidth) return;
      const settled = Math.round(track.scrollLeft / track.clientWidth);
      if (settled !== index) onGoTo(settled);
    });
  };

  // --- Drag down to dismiss -------------------------------------------
  const onPointerDown = (event: React.PointerEvent) => {
    dragged.current = false;
    // Primary pointer, main button (fields some engines leave unset count).
    if (event.isPrimary === false || event.button > 0) return;
    drag.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      mode: "pending",
      dy: 0,
    };
  };
  const onPointerMove = (event: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== event.pointerId || d.mode === "none") return;
    const dx = event.clientX - d.x;
    const dy = event.clientY - d.y;
    if (d.mode === "pending") {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      dragged.current = true;
      // Sideways is the track's job; only a mostly-downward pull dismisses.
      if (dy <= 0 || Math.abs(dy) < Math.abs(dx)) {
        d.mode = "none";
        return;
      }
      d.mode = "dismiss";
      (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    }
    d.dy = Math.max(0, dy);
    const img = currentImg(index);
    if (img) {
      const shrink = 1 - Math.min(d.dy / 1200, 0.25);
      img.style.transform = `translate(${dx * 0.5}px, ${d.dy}px) scale(${shrink})`;
    }
    if (groundRef.current) {
      groundRef.current.style.opacity = String(1 - Math.min(d.dy / 360, 0.85));
    }
  };
  const onPointerEnd = (event: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== event.pointerId || d.mode !== "dismiss") return;
    if (d.dy > DISMISS_DRAG_PX) {
      requestClose();
      return;
    }
    // Not far enough: spring back.
    const img = currentImg(index);
    const ground = groundRef.current;
    if (canAnimate(img) && !prefersReducedMotion()) {
      const from = img.style.transform || "none";
      img.style.transform = "";
      img.animate([{ transform: from }, { transform: "none" }], {
        duration: 220,
        easing: EASE,
      });
    } else if (img) {
      img.style.transform = "";
    }
    if (ground) ground.style.opacity = "";
  };

  return (
    <dialog
      ref={dialogRef}
      aria-label={
        photo
          ? hasMany
            ? t("counter", { current: index + 1, total })
            : t("open")
          : undefined
      }
      onClose={onClose}
      onCancel={(event) => {
        // Escape: run the zoom-out instead of vanishing.
        event.preventDefault();
        requestClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") {
          event.preventDefault();
          onGoTo(index + 1);
        } else if (event.key === "ArrowLeft") {
          event.preventDefault();
          onGoTo(index - 1);
        }
      }}
      className="journiq-lightbox m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden bg-transparent p-0 text-white backdrop:bg-transparent"
    >
      {session ? (
        <>
          <div
            ref={groundRef}
            aria-hidden="true"
            className="absolute inset-0 bg-black"
          />
          <div className="relative flex h-full w-full flex-col">
            <div
              ref={chromeRef}
              className="flex items-center justify-between gap-3 px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 sm:px-4"
            >
              <span
                className="text-sm tabular-nums text-white/70"
                aria-live="polite"
              >
                {hasMany ? t("counter", { current: index + 1, total }) : ""}
              </span>
              <button
                type="button"
                onClick={requestClose}
                aria-label={t("close")}
                className="journiq-lightbox-control"
              >
                <CloseIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="relative min-h-0 flex-1">
              <div
                ref={trackRef}
                onScroll={onTrackScroll}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerEnd}
                onPointerCancel={onPointerEnd}
                className="nf-scroll-x flex h-full w-full touch-pan-x snap-x snap-mandatory overflow-x-auto overscroll-contain"
              >
                {session.photos.map((item, i) => (
                  <figure
                    key={`${i}:${item.url}`}
                    ref={(el) => {
                      slideRefs.current[i] = el;
                    }}
                    // Only the current photo is exposed to assistive tech;
                    // the others are off to the side of the track.
                    aria-hidden={i === index ? undefined : true}
                    onClick={(event) => {
                      // A tap on the dark ground around the photo closes,
                      // as every other modal on the site does; a drag
                      // that ended here does not.
                      if (
                        event.target === event.currentTarget &&
                        !dragged.current
                      ) {
                        requestClose();
                      }
                    }}
                    className="m-0 flex h-full w-full shrink-0 snap-center snap-always flex-col items-center justify-center gap-3 px-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-16"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- same URL the page's own photo already loaded; a signed or public-bucket URL, not an optimizable static source */}
                    <img
                      src={item.url}
                      alt={item.alt}
                      decoding="async"
                      draggable={false}
                      loading={Math.abs(i - index) <= 1 ? "eager" : "lazy"}
                      className="max-h-full min-h-0 max-w-full select-none rounded-md object-contain will-change-transform"
                    />
                    {item.caption ? (
                      <figcaption className="max-w-prose text-center text-sm text-white/80">
                        {item.caption}
                      </figcaption>
                    ) : null}
                  </figure>
                ))}
              </div>

              {/* Desktop only: a phone swipes. `!` because the shared
                  .journiq-lightbox-control class (unlayered) sets
                  display: inline-flex, which beats a plain `hidden`. */}
              {hasMany && index > 0 ? (
                <button
                  type="button"
                  onClick={() => onGoTo(index - 1)}
                  aria-label={t("previous")}
                  className="journiq-lightbox-control absolute top-1/2 left-2 -translate-y-1/2 max-md:hidden! sm:left-4"
                >
                  <ChevronIcon className="h-6 w-6 rotate-180" />
                </button>
              ) : null}
              {hasMany && index < total - 1 ? (
                <button
                  type="button"
                  onClick={() => onGoTo(index + 1)}
                  aria-label={t("next")}
                  className="journiq-lightbox-control absolute top-1/2 right-2 -translate-y-1/2 max-md:hidden! sm:right-4"
                >
                  <ChevronIcon className="h-6 w-6" />
                </button>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </dialog>
  );
}

/**
 * Wraps a story photo so clicking it opens the viewer. `children` is the
 * existing <img> (with whatever sizing classes it already had); this only
 * adds the button shell and registers the photo with the page's provider.
 *
 * `className` / `style` land on the button, which is where layout belongs
 * once the image is wrapped — an inline-block button around a block image
 * would otherwise collapse the image's own width rules.
 */
export function LightboxPhoto({
  url,
  alt,
  caption,
  className,
  style,
  children,
}: LightboxPhotoData & {
  className?: string;
  style?: React.CSSProperties;
  children: ReactNode;
}) {
  const t = useTranslations("common.photoLightbox");
  const context = useContext(LightboxContext);
  const id = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Re-register whenever the photo's data changes: preview pages re-mint
  // short-lived signed URLs, and the viewer must open the current one.
  useEffect(() => {
    if (!context) return;
    const element = buttonRef.current;
    if (!element) return;
    context.register(id, { element, url, alt, caption });
    return () => context.unregister(id);
  }, [context, id, url, alt, caption]);

  // No provider (a component rendered on its own in a test): keep the same
  // layout box so sizing behaves identically, just without the button.
  if (!context) {
    return (
      <span style={style} className={className}>
        {children}
      </span>
    );
  }

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={() => context.open(id)}
      // The photo's own alt text already describes it; the button's label
      // says what pressing it does, and the image inside is hidden from the
      // accessible name so a screen reader doesn't read the alt twice.
      aria-label={alt ? `${t("open")}: ${alt}` : t("open")}
      style={style}
      className={`journiq-lightbox-trigger cursor-zoom-in appearance-none border-0 bg-transparent p-0 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${className ?? ""}`}
    >
      {children}
    </button>
  );
}
