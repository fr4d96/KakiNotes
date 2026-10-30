"use client";

import { useEffect } from "react";

/**
 * Stops two-finger pinch zooming the whole page in the home-screen app, so
 * it behaves like an app rather than a web page (2026-10-30, at the owner's
 * request). Safari tabs keep normal pinch-zoom, and the viewport still
 * allows scaling (app/layout.tsx) -- this is deliberately limited to the
 * installed app. iOS's own system Zoom (Settings > Accessibility > Zoom)
 * is unaffected everywhere, so readers who need magnification still have it.
 *
 * Two layers, because iOS does not always honour the CSS one: app/globals.css
 * sets `touch-action: pan-x pan-y` on <html> in `display-mode: standalone`
 * (also stops double-tap zoom), and this cancels WebKit's own pinch events
 * (`gesturestart` / `gesturechange`). Neither touches touch events, so the
 * journey map's own two-finger zoom (components/story/use-map-gestures.ts)
 * keeps working. Rendered once, from the root layout. Renders no DOM.
 */
export function NoPinchZoom() {
  useEffect(() => {
    const installed =
      window.matchMedia?.("(display-mode: standalone)").matches === true ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (!installed) return;
    const cancel = (event: Event) => event.preventDefault();
    document.addEventListener("gesturestart", cancel, { passive: false });
    document.addEventListener("gesturechange", cancel, { passive: false });
    return () => {
      document.removeEventListener("gesturestart", cancel);
      document.removeEventListener("gesturechange", cancel);
    };
  }, []);

  return null;
}
