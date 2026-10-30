"use client";

import { useEffect, useId, useRef, type PointerEvent } from "react";
import { useTranslations } from "next-intl";
import { CloseIcon } from "@/components/icons";

/**
 * Background scroll lock, reference-counted so two sheets (or a sheet over a
 * lightbox) can't restore each other's overflow out of order. A modal
 * <dialog> blocks pointer interaction with the page but, on iOS Safari, the
 * page behind it can still rubber-band and scroll; this stops that.
 */
let scrollLocks = 0;
let savedOverflow: [string, string] = ["", ""];
function lockScroll() {
  if (scrollLocks++ > 0) return;
  savedOverflow = [
    document.documentElement.style.overflow,
    document.body.style.overflow,
  ];
  document.documentElement.style.overflow = "hidden";
  document.body.style.overflow = "hidden";
}
function unlockScroll() {
  if (--scrollLocks > 0) return;
  scrollLocks = 0;
  document.documentElement.style.overflow = savedOverflow[0];
  document.body.style.overflow = savedOverflow[1];
}

// Past a quarter of the sheet's height, or a flick faster than 0.5 px/ms
// (500 px/s) of at least a few pixels, a release dismisses; otherwise the
// sheet springs back.
const DISMISS_FRACTION = 0.25;
const FLICK_VELOCITY = 0.5;

// Pointer capture keeps the move/up events coming to the header even when the
// finger slides off it. It can throw (an id that is no longer active) and is
// absent in some test environments, and a drag works well enough without it.
function capture(el: HTMLElement, pointerId: number, on: boolean) {
  try {
    if (on) el.setPointerCapture?.(pointerId);
    else el.releasePointerCapture?.(pointerId);
  } catch {
    // ignore
  }
}

type DragState = {
  startY: number;
  lastY: number;
  lastT: number;
  velocity: number;
};

/**
 * A phone-first bottom sheet on a native <dialog> -- same showModal()/close()
 * mechanics as components/ui/confirm-dialog.tsx and components/auth/
 * auth-modal.tsx, so focus is trapped, the sheet sits in the top layer above
 * the sticky header, Escape closes it and focus returns to whatever opened
 * it, all natively.
 *
 * Entrance and exit are CSS only: `translate` (and the backdrop's opacity)
 * transition with `transition-behavior: allow-discrete`, and `starting:` (@starting-style) supplies the
 * off-screen "from" state on open, so the slide plays in both directions
 * even though `close()` flips display to none. Under prefers-reduced-motion
 * (`motion-reduce:`) there is no transition at all: it appears and
 * disappears instantly.
 *
 * Dismissal: backdrop tap, Escape, the close button, or dragging the handle /
 * header down. The drag follows the finger through an inline `transform`
 * (kept separate from the `translate` property the open/close transition
 * uses, so the two compose rather than fight), and on release either hands
 * off to the normal close transition or springs back.
 *
 * Children mount only while open unless `keepMounted` -- the filter sheet
 * needs its form fields to exist (and submit) while the sheet is closed.
 * `footer` is pinned under the scrolling body (e.g. Apply / Clear).
 *
 * Phones only: callers decide that (components/ui/use-is-phone.ts) and keep
 * their desktop dropdown / inline layout at md+.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
  footer,
  keepMounted = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  keepMounted?: boolean;
}) {
  const t = useTranslations("common");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      // A previous drag-dismiss leaves its offset behind (the exit
      // transition continued from the finger); clear it for a clean open.
      dialog.style.transform = "";
      dialog.style.transition = "";
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    lockScroll();
    return unlockScroll;
  }, [open]);

  // A phone-only surface: if the viewport grows past `md` while it is open
  // (rotating a tablet, resizing a window) the caller's desktop layout takes
  // over, so close rather than strand a modal over it.
  useEffect(() => {
    if (!open || typeof window === "undefined" || !window.matchMedia) return;
    const list = window.matchMedia("(min-width: 48rem)");
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) onClose();
    };
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, [open, onClose]);

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    // The close button inside the header is a button, not a drag handle.
    if ((event.target as HTMLElement).closest("button")) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    capture(event.currentTarget, event.pointerId, true);
    dragRef.current = {
      startY: event.clientY,
      lastY: event.clientY,
      lastT: performance.now(),
      velocity: 0,
    };
    // Follow the finger 1:1 -- no easing while it's down.
    dialog.style.transition = "none";
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const dialog = dialogRef.current;
    if (!drag || !dialog) return;
    const dy = Math.max(0, event.clientY - drag.startY);
    const now = performance.now();
    const dt = now - drag.lastT;
    if (dt > 0) {
      // Smoothed so one jittery sample at release can't fake a flick.
      drag.velocity =
        0.6 * ((event.clientY - drag.lastY) / dt) + 0.4 * drag.velocity;
    }
    drag.lastY = event.clientY;
    drag.lastT = now;
    dialog.style.transform = dy > 0 ? `translateY(${dy}px)` : "";
  }

  function endDrag(event: PointerEvent<HTMLDivElement>, cancelled: boolean) {
    const drag = dragRef.current;
    const dialog = dialogRef.current;
    dragRef.current = null;
    if (!drag || !dialog) return;
    capture(event.currentTarget, event.pointerId, false);
    const dy = Math.max(0, event.clientY - drag.startY);
    // Hand the transition back to the stylesheet before deciding, so both
    // outcomes (spring back, or the exit slide) animate.
    dialog.style.transition = "";
    const dismiss =
      !cancelled &&
      (dy > dialog.offsetHeight * DISMISS_FRACTION ||
        (drag.velocity > FLICK_VELOCITY && dy > 8));
    if (dismiss) {
      onClose();
    } else {
      dialog.style.transform = "";
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        // A click landing on the <dialog> element itself (not a child) hit
        // the backdrop -- native <dialog> doesn't close on that by default.
        if (event.target === dialogRef.current) onClose();
      }}
      className={[
        // Geometry: pinned to the bottom edge, full width, capped height.
        "fixed inset-x-0 top-auto bottom-0 m-0 h-auto max-h-[85dvh] w-full max-w-none overflow-hidden",
        "rounded-t-3xl border border-b-0 border-border-subtle bg-surface p-0 text-foreground shadow-2xl",
        // Slide: closed = fully below the edge; open = resting; the
        // @starting-style block gives the open transition its "from".
        "translate-y-full open:translate-y-0 starting:open:translate-y-full",
        "transition-[translate,transform,overlay,display] transition-discrete duration-250 ease-[cubic-bezier(0.32,0.72,0,1)]",
        // Backdrop: fades independently.
        "backdrop:bg-black/50 backdrop:opacity-0 backdrop:transition-[opacity,overlay,display] backdrop:transition-discrete backdrop:duration-250",
        "[&[open]::backdrop]:opacity-100 [@starting-style]:[&[open]::backdrop]:opacity-0",
        // Reduced motion: no slide, no fade -- appears and disappears.
        "motion-reduce:transition-none motion-reduce:backdrop:transition-none",
      ].join(" ")}
    >
      <div className="flex max-h-[85dvh] flex-col pb-[env(safe-area-inset-bottom)]">
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(event) => endDrag(event, false)}
          onPointerCancel={(event) => endDrag(event, true)}
          className="shrink-0 cursor-grab touch-none select-none"
        >
          <div className="flex justify-center pt-2.5" aria-hidden="true">
            <span className="h-1.5 w-10 rounded-full bg-foreground/20" />
          </div>
          <div className="flex items-center justify-between gap-3 py-1 pr-2 pl-5">
            <h2 id={titleId} className="text-lg font-semibold tracking-tight">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("close")}
              className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-foreground/70 transition-colors hover:bg-surface-muted hover:text-foreground"
            >
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3">
          {open || keepMounted ? children : null}
        </div>
        {footer ? (
          <div className="shrink-0 border-t border-border-subtle px-5 py-3">
            {open || keepMounted ? footer : null}
          </div>
        ) : null}
      </div>
    </dialog>
  );
}
