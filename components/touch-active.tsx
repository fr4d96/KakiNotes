"use client";

import { useEffect } from "react";

/**
 * Makes `:active` (the `.press` feedback, button press states) fire on
 * non-link elements in iOS Safari / the installed home-screen app.
 *
 * iOS only applies the `:active` pseudo-class on touch for elements other
 * than links when some touch listener exists on the page (a long-standing
 * WebKit quirk: no listener, no `:active`). One passive no-op `touchstart`
 * listener on `document` is the standard, cost-free way to opt in. It is
 * passive, so it can never delay scrolling, and it does nothing else.
 *
 * Rendered once, from the root layout. Renders no DOM.
 */
export function TouchActive() {
  useEffect(() => {
    const noop = () => {};
    document.addEventListener("touchstart", noop, { passive: true });
    return () => document.removeEventListener("touchstart", noop);
  }, []);

  return null;
}
