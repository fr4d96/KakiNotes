"use client";

import { useEffect } from "react";

/**
 * Tells the user "that registered" on every tap or click of a button-like
 * control, app-wide: a short spring-back pulse (scale 0.94 -> 1).
 *
 * Why this exists beside `.press` (globals.css): `.press` styles :active,
 * which only lasts while the finger is down. A quick tap on iOS holds
 * :active for ~50ms, shorter than the 120ms dip, so the feedback barely
 * showed -- and most buttons never had `.press` at all. This listens for
 * `click` instead, which fires only for a real tap (never for a touch that
 * turned into a scroll), and plays a Web Animation that runs to completion
 * whatever the finger does next.
 *
 * Skipped on purpose:
 * - tall targets (cards, photos -- anything over MAX_PULSE_HEIGHT): a whole
 *   card bouncing reads as a glitch, and those navigate away anyway;
 * - `.press-hover-only` surfaces and the photo-viewer trigger, for the same
 *   reason; and anything inside `[data-no-pulse]`, the explicit opt-out.
 *
 * Reduced motion swaps the scale for an opacity dip (a state change, not
 * movement). The transform is composited "add", so it stacks on whatever
 * transform the control already has instead of replacing it.
 *
 * Rendered once, from the root layout. Renders no DOM.
 */

const TAPPABLE = [
  "button",
  '[role="button"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="menuitemradio"]',
  '[role="option"]',
  '[role="switch"]',
  "summary",
  'input[type="submit"]',
  'input[type="button"]',
  'input[type="checkbox"]',
  'input[type="radio"]',
  ".press",
  ".night-button-primary",
  ".night-button-ghost",
  ".journiq-button",
].join(", ");

const SKIP = "[data-no-pulse], .press-hover-only, .journiq-lightbox-trigger";

/** Taller than this is a card or a photo, not a control. */
const MAX_PULSE_HEIGHT = 120;

const EASE_OUT = "cubic-bezier(0.16, 0.84, 0.28, 1)";

export function pulseTarget(start: EventTarget | null): HTMLElement | null {
  if (!(start instanceof Element)) return null;
  const el = start.closest<HTMLElement>(TAPPABLE);
  if (!el || el.closest(SKIP)) return null;
  if (el.matches(":disabled, [aria-disabled='true']")) return null;
  if (el.getBoundingClientRect().height > MAX_PULSE_HEIGHT) return null;
  return el;
}

export function ClickPulse() {
  useEffect(() => {
    const running = new WeakMap<HTMLElement, Animation>();
    const reduceMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    );

    function onClick(event: MouseEvent) {
      const el = pulseTarget(event.target);
      if (!el || typeof el.animate !== "function") return;
      // A double tap restarts the pulse rather than stacking two.
      running.get(el)?.cancel();
      const animation = reduceMotion?.matches
        ? el.animate(
            [
              { opacity: Number(getComputedStyle(el).opacity) * 0.55 },
              { opacity: getComputedStyle(el).opacity },
            ],
            { duration: 260, easing: EASE_OUT },
          )
        : el.animate(
            [{ transform: "scale(0.94)" }, { transform: "scale(1)" }],
            { duration: 280, easing: EASE_OUT, composite: "add" },
          );
      running.set(el, animation);
    }

    // Capture phase: runs before a handler that unmounts the button (a
    // dialog's close, a menu item) can take it out of the document.
    document.addEventListener("click", onClick, { capture: true });
    return () =>
      document.removeEventListener("click", onClick, { capture: true });
  }, []);

  return null;
}
