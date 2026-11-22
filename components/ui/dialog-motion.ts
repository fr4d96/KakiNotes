"use client";

import { useEffect, useRef, type RefObject, type SyntheticEvent } from "react";

/**
 * Open/close animation for every native <dialog> in the app (bottom sheets,
 * ConfirmDialog, AuthModal, the desktop share dialog), driven by the Web
 * Animations API rather than CSS.
 *
 * Why not CSS: animating a <dialog> in CSS needs @starting-style for the
 * entrance (iOS 17.5+ only) and a `transition` on `overlay` with
 * `transition-behavior: allow-discrete` for the exit. No Safari transitions
 * `overlay`, so on every iPhone a closing dialog left the top layer at once
 * and the exit never played; before iOS 17.5 the entrance didn't play
 * either. element.animate() works on every iOS a home-screen web app can
 * run, and lets the exit finish BEFORE close() is called.
 *
 * Under prefers-reduced-motion, or where animate() is missing (jsdom),
 * nothing animates: the dialog opens and closes instantly, as before.
 */

export type DialogMotion = {
  /** Keyframes for opening; reversed for closing. `from` is the dialog's
   * current inline transform, so a drag-dismissed sheet closes from where
   * the finger let go. */
  enter: (from?: string) => Keyframe[];
  exit: (from: string) => Keyframe[];
  enterMs: number;
  exitMs: number;
  easing: string;
};

const SHEET_EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

/** Bottom sheet: slides up from below the screen. */
export const SHEET_MOTION: DialogMotion = {
  enter: () => [{ transform: "translateY(100%)" }, { transform: "none" }],
  exit: (from) => [{ transform: from }, { transform: "translateY(100%)" }],
  enterMs: 300,
  exitMs: 220,
  easing: SHEET_EASE,
};

/** Centered card (a bottom sheet at md+): fades and rises a little. */
export const CARD_MOTION: DialogMotion = {
  enter: () => [
    { opacity: 0, transform: "translateY(1.5rem)" },
    { opacity: 1, transform: "none" },
  ],
  exit: (from) => [
    { opacity: 1, transform: from },
    { opacity: 0, transform: "translateY(1.5rem)" },
  ],
  enterMs: 300,
  exitMs: 220,
  easing: SHEET_EASE,
};

/** Small centered modal (ConfirmDialog, AuthModal, share dialog): the
 * same fade-and-grow the old `.journiq-modal` CSS used. */
export const POP_MOTION: DialogMotion = {
  enter: () => [
    { opacity: 0, transform: "translateY(12px) scale(0.96)" },
    { opacity: 1, transform: "none" },
  ],
  exit: (from) => [
    { opacity: 1, transform: from },
    { opacity: 0, transform: "translateY(12px) scale(0.96)" },
  ],
  enterMs: 200,
  exitMs: 180,
  easing: "ease",
};

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Not in jsdom (no animate()), and never under reduced motion. */
export function canAnimateDialog(el: HTMLElement): boolean {
  return typeof el.animate === "function" && !prefersReducedMotion();
}

/** Fades the ::backdrop; skipped quietly where pseudoElement isn't supported. */
function animateBackdrop(
  dialog: HTMLDialogElement,
  from: number,
  to: number,
  duration: number,
): Animation | null {
  try {
    return dialog.animate(
      { opacity: [from, to] },
      {
        duration,
        easing: "ease-out",
        pseudoElement: "::backdrop",
        fill: to === 0 ? "forwards" : "none",
      },
    );
  } catch {
    return null;
  }
}

/**
 * Opens the dialog (showModal) when `open` turns true and closes it when it
 * turns false, animating both. `motion` is read at the moment of each open
 * or close, so a caller can pick per viewport (sheet on a phone, card on a
 * desktop).
 *
 * Returns an `onCancel` handler for the <dialog>: Escape then goes through
 * the caller's onClose (and so animates) instead of the browser hiding the
 * dialog at once.
 */
export function useDialogMotion(
  dialogRef: RefObject<HTMLDialogElement | null>,
  open: boolean,
  motion: () => DialogMotion,
  onClose: () => void,
): { onCancel: (event: SyntheticEvent<HTMLDialogElement>) => void } {
  // The running close animation(s): a reopen mid-close cancels them, and a
  // second close request doesn't start another.
  const exitRef = useRef<Animation[] | null>(null);
  const motionRef = useRef(motion);
  useEffect(() => {
    motionRef.current = motion;
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      if (exitRef.current) {
        // Reopened while closing: stop the exit; it is still open.
        for (const anim of exitRef.current) anim.cancel();
        exitRef.current = null;
        dialog.style.transform = "";
        return;
      }
      if (dialog.open) return;
      // A previous drag-dismiss leaves its offset behind; clear it.
      dialog.style.transform = "";
      dialog.style.transition = "";
      dialog.showModal();
      if (canAnimateDialog(dialog)) {
        const m = motionRef.current();
        dialog.animate(m.enter(), { duration: m.enterMs, easing: m.easing });
        animateBackdrop(dialog, 0, 1, m.enterMs);
      }
      return;
    }

    if (!dialog.open || exitRef.current) return;
    if (!canAnimateDialog(dialog)) {
      dialog.close();
      return;
    }
    const m = motionRef.current();
    const slide = dialog.animate(m.exit(dialog.style.transform || "none"), {
      duration: m.exitMs,
      easing: m.easing,
      fill: "forwards",
    });
    const fade = animateBackdrop(dialog, 1, 0, m.exitMs);
    const running = fade ? [slide, fade] : [slide];
    exitRef.current = running;
    const finish = () => {
      if (exitRef.current !== running) return;
      exitRef.current = null;
      dialog.close();
      dialog.style.transform = "";
      for (const anim of running) anim.cancel();
    };
    slide.onfinish = finish;
    // The finish event waits for the next painted frame, which a hidden or
    // frozen page may not get; a timer makes sure the dialog still closes.
    window.setTimeout(finish, m.exitMs + 100);
  }, [open, dialogRef]);

  return {
    onCancel: (event) => {
      if (!canAnimateDialog(event.currentTarget)) return;
      event.preventDefault();
      onClose();
    },
  };
}
