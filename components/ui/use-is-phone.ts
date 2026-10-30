"use client";

import { useSyncExternalStore } from "react";

/**
 * True below Tailwind's `md` breakpoint (48rem) -- the "phone" side of every
 * `md:` split in the header and filter controls. rem, not px, so it moves in
 * lockstep with the `md:` utilities even when the reader scales their font.
 *
 * Used where a phone gets a different COMPONENT (a bottom sheet instead of a
 * dropdown) rather than different styling, so exactly one of the two is ever
 * in the DOM -- two copies of a menu would double every landmark, link and
 * form field for assistive tech and break form submission semantics.
 *
 * The server snapshot is `false` (desktop). Every consumer only renders its
 * phone variant once something has been OPENED, so there is nothing to
 * mismatch on hydration. Where matchMedia doesn't exist (jsdom, very old
 * engines) it also reads as "not a phone".
 */
const QUERY = "(max-width: 47.99rem)";

function subscribe(onChange: () => void) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const list = window.matchMedia(QUERY);
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

function getSnapshot() {
  return typeof window !== "undefined" && !!window.matchMedia
    ? window.matchMedia(QUERY).matches
    : false;
}

export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
