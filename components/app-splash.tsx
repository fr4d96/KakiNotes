"use client";

import { useEffect } from "react";
import { SPLASH_ICON_SIZE } from "@/lib/pwa/splash-screens";

/** Shortest time, from launch, the splash stays up -- so it never just flickers. */
const MIN_VISIBLE_MS = 400;
/** Matches the fade in app/globals.css (.app-splash). */
const FADE_MS = 280;

/**
 * The home-screen app's splash: what the reader sees between iOS's own
 * launch image (lib/pwa/splash-screens.ts) and a usable page. It is drawn
 * in the server HTML, so it is on screen from the very first paint, and
 * looks exactly like the launch image -- the app icon as a rounded tile in
 * the centre, on the app's background -- plus a thin loading bar that
 * appears only if loading takes a moment. Once React has hydrated (the page
 * can respond to taps), it fades out.
 *
 * Shown only in the installed app (`display-mode: standalone`, app/
 * globals.css): in a browser tab the browser's own progress UI already
 * says the page is loading. It lives in the root layout, which never
 * re-renders on navigation, so it appears on launch only, not on every
 * page change. A CSS fail-safe hides it after 10s even if this script never
 * runs. Decorative for assistive tech (aria-hidden).
 */
export function AppSplash() {
  useEffect(() => {
    const el = document.getElementById("app-splash");
    if (!el || el.dataset.state) return;
    const hide = window.setTimeout(
      () => {
        el.dataset.state = "hiding";
        // Hidden for good once faded; the element stays (React owns it).
        window.setTimeout(() => {
          el.dataset.state = "done";
        }, FADE_MS);
      },
      Math.max(0, MIN_VISIBLE_MS - performance.now()),
    );
    return () => window.clearTimeout(hide);
  }, []);

  return (
    <div id="app-splash" className="app-splash" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- must paint with the first HTML byte, before any JS; next/image adds nothing for a fixed 120px local icon */}
      <img
        src="/icons/icon-192.png"
        alt=""
        width={SPLASH_ICON_SIZE}
        height={SPLASH_ICON_SIZE}
        className="app-splash-icon"
      />
      <span className="app-splash-bar" />
    </div>
  );
}
