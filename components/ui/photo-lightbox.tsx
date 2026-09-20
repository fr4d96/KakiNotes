"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
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
 * auth-modal.tsx: showModal() traps focus and closes on Escape natively, a
 * click on the dialog's own box (the dark ground, not the photo or a
 * button) closes it, and ← / → or a horizontal swipe move between photos.
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

/** Minimum horizontal travel (px) for a pointer drag to count as a swipe. */
const SWIPE_THRESHOLD_PX = 48;

export function PhotoLightboxProvider({ children }: { children: ReactNode }) {
  const registry = useRef(new Map<string, RegistryEntry>());
  const [session, setSession] = useState<{
    photos: LightboxPhotoData[];
    index: number;
  } | null>(null);

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
      index,
    });
  }, []);

  const close = useCallback(() => setSession(null), []);

  // Wrap around at both ends so "next" on the last photo comes back to the
  // first — nobody is stranded on an edge.
  const step = useCallback((delta: number) => {
    setSession((current) => {
      if (!current || current.photos.length < 2) return current;
      const total = current.photos.length;
      return { ...current, index: (current.index + delta + total) % total };
    });
  }, []);

  const contextValue = useMemo(
    () => ({ register, unregister, open }),
    [register, unregister, open],
  );

  return (
    <LightboxContext.Provider value={contextValue}>
      {children}
      <LightboxDialog session={session} onClose={close} onStep={step} />
    </LightboxContext.Provider>
  );
}

function LightboxDialog({
  session,
  onClose,
  onStep,
}: {
  session: { photos: LightboxPhotoData[]; index: number } | null;
  onClose: () => void;
  onStep: (delta: number) => void;
}) {
  const t = useTranslations("common.photoLightbox");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const swipeStartX = useRef<number | null>(null);
  // Where the current press began. A drag that starts on the photo and
  // lets go over the dark ground still fires a `click` on the <dialog>
  // (browsers dispatch it on the nearest common ancestor), and that must
  // read as a swipe, not a close.
  const pressTarget = useRef<EventTarget | null>(null);

  const isOpen = session !== null;
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) dialog.showModal();
    if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);

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

  const total = session?.photos.length ?? 0;
  const hasMany = total > 1;
  const index = session?.index ?? 0;
  const photo = session?.photos[index] ?? null;

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
      onClick={(event) => {
        // A click on the <dialog> element itself is the dark ground around
        // the photo — close, matching every other modal on the site.
        if (
          event.target === dialogRef.current &&
          pressTarget.current === dialogRef.current
        ) {
          onClose();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") {
          event.preventDefault();
          onStep(1);
        } else if (event.key === "ArrowLeft") {
          event.preventDefault();
          onStep(-1);
        }
      }}
      onPointerDown={(event) => {
        pressTarget.current = event.target;
        swipeStartX.current = event.clientX;
      }}
      onPointerUp={(event) => {
        const startX = swipeStartX.current;
        swipeStartX.current = null;
        if (startX === null) return;
        const travel = event.clientX - startX;
        if (Math.abs(travel) < SWIPE_THRESHOLD_PX) return;
        // Dragging left reveals the next photo, the way a phone gallery does.
        onStep(travel < 0 ? 1 : -1);
      }}
      onPointerCancel={() => {
        swipeStartX.current = null;
      }}
      className="journiq-lightbox m-0 h-dvh max-h-none w-screen max-w-none touch-pan-y bg-black p-0 text-white backdrop:bg-transparent"
    >
      {photo ? (
        <div className="pointer-events-none flex h-full w-full flex-col">
          <div className="flex items-center justify-between gap-3 px-3 py-2 sm:px-4">
            <span
              className="text-sm tabular-nums text-white/70"
              aria-live="polite"
            >
              {hasMany ? t("counter", { current: index + 1, total }) : ""}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("close")}
              className="journiq-lightbox-control pointer-events-auto"
            >
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>

          <figure className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-3 pb-4 sm:px-16">
            {/* eslint-disable-next-line @next/next/no-img-element -- same URL the page's own thumbnail already loaded; a signed or public-bucket URL, not an optimizable static source */}
            <img
              src={photo.url}
              alt={photo.alt}
              decoding="async"
              draggable={false}
              className="pointer-events-auto max-h-full max-w-full select-none rounded-md object-contain"
            />
            {photo.caption ? (
              <figcaption className="max-w-prose text-center text-sm text-white/80">
                {photo.caption}
              </figcaption>
            ) : null}

            {hasMany ? (
              <>
                <button
                  type="button"
                  onClick={() => onStep(-1)}
                  aria-label={t("previous")}
                  className="journiq-lightbox-control pointer-events-auto absolute left-2 top-1/2 -translate-y-1/2 sm:left-4"
                >
                  <ChevronIcon className="h-6 w-6 rotate-180" />
                </button>
                <button
                  type="button"
                  onClick={() => onStep(1)}
                  aria-label={t("next")}
                  className="journiq-lightbox-control pointer-events-auto absolute right-2 top-1/2 -translate-y-1/2 sm:right-4"
                >
                  <ChevronIcon className="h-6 w-6" />
                </button>
              </>
            ) : null}
          </figure>
        </div>
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
