"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

/** How far (after resistance) a pull must travel to refresh on release. */
export const PULL_THRESHOLD = 72;
/** The indicator stops following the finger past this. */
const MAX_PULL = 110;
/** Finger travel is halved, so it takes a deliberate, "hard" pull. */
const RESISTANCE = 0.5;
/** Let the spinner paint before the page is torn down for the reload. */
const RELOAD_DELAY_MS = 150;
/** If the reload never happens (offline, blocked), stop spinning after this. */
const GIVE_UP_MS = 10_000;

/**
 * Where a pull must never start: anything with its own drag or scroll
 * (maps, the photo viewer and sheets, which are <dialog>s, carousels), text
 * entry, and an explicit opt-out.
 */
const NO_PULL =
  'dialog, [role="dialog"], svg[role="group"], [aria-roledescription="carousel"], input, textarea, select, [contenteditable="true"], [data-no-pull]';

function isInstalledApp(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** True when the touch starts inside something that is itself scrolled down. */
function insideScrolledBox(start: Element | null): boolean {
  for (let el = start; el && el !== document.body; el = el.parentElement) {
    if (el.scrollTop > 0) return true;
  }
  return false;
}

/**
 * Instagram-style pull to refresh for the home-screen app, where iOS gives
 * none (Safari tabs have their own, so this stays off there). At the very
 * top of a page, dragging down shows a round refresh icon that follows the
 * finger and turns as it fills; released past the threshold it spins and
 * the page RELOADS -- everything re-fetched, every component starting from
 * fresh data, at the top (a pull can only start at the top). Released short
 * of it, it springs back.
 *
 * A full reload, not router.refresh() (2026-10-30): the soft refresh changed
 * nothing visible when nothing had changed, and pages that copy their server
 * data into state on first render (story folders, a journey's page) ignored
 * it altogether. The launch splash is skipped on a reload by the head
 * script in app/layout.tsx, so the reader sees the spinner, then the page.
 *
 * Listeners are passive (they never block scrolling), and a pull is only
 * considered when the page is scrolled to the top, no scroll lock is on (a
 * sheet or the photo viewer is open), and the touch did not start inside
 * anything in NO_PULL or an inner box that is itself scrolled. In the
 * installed app the page's own rubber-band is turned off
 * (app/globals.css), so the indicator is the only thing that moves.
 * Rendered once, from the root layout.
 */
export function PullToRefresh({
  reload = () => window.location.reload(),
}: {
  /** The reload itself; injectable so tests can watch it. */
  reload?: () => void;
} = {}) {
  const t = useTranslations("common.pullToRefresh");
  const [pull, setPull] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const startY = useRef<number | null>(null);
  const pullRef = useRef(0);
  const reloadRef = useRef(reload);
  useEffect(() => {
    reloadRef.current = reload;
  }, [reload]);

  useEffect(() => {
    function reset() {
      startY.current = null;
      pullRef.current = 0;
      setPull(0);
    }

    function onStart(event: TouchEvent) {
      if (event.touches.length !== 1 || !isInstalledApp()) return;
      if (window.scrollY > 0) return;
      if (document.documentElement.style.overflow === "hidden") return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(NO_PULL) || insideScrolledBox(target)) return;
      startY.current = event.touches[0].clientY;
    }

    function onMove(event: TouchEvent) {
      if (startY.current === null) return;
      const dy = event.touches[0].clientY - startY.current;
      // Scrolling up, or the page moved after all: not a pull.
      if (dy <= 0 || window.scrollY > 0) {
        if (pullRef.current !== 0) reset();
        return;
      }
      const next = Math.min(MAX_PULL, dy * RESISTANCE);
      pullRef.current = next;
      setPull(next);
    }

    function onEnd() {
      if (startY.current === null) return;
      const pulled = pullRef.current;
      reset();
      if (pulled < PULL_THRESHOLD) return;
      setSpinning(true);
      window.setTimeout(() => reloadRef.current(), RELOAD_DELAY_MS);
    }

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: true });
    document.addEventListener("touchend", onEnd, { passive: true });
    document.addEventListener("touchcancel", reset, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", reset);
    };
  }, []);

  // Normally the reload replaces this page while it spins; if it never
  // does, don't spin forever.
  useEffect(() => {
    if (!spinning) return;
    const id = window.setTimeout(() => setSpinning(false), GIVE_UP_MS);
    return () => window.clearTimeout(id);
  }, [spinning]);

  const shown = spinning ? PULL_THRESHOLD : pull;
  const progress = Math.min(1, pull / PULL_THRESHOLD);

  return (
    <>
      <div
        aria-hidden="true"
        data-state={spinning ? "refreshing" : pull > 0 ? "pulling" : "idle"}
        className="ptr-indicator"
        style={{
          transform: `translate(-50%, ${shown - 48}px)`,
          opacity: spinning ? 1 : Math.min(1, pull / 24),
        }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="ptr-icon"
          style={
            spinning ? undefined : { transform: `rotate(${progress * 270}deg)` }
          }
        >
          {spinning ? (
            <path d="M21 12a9 9 0 1 1-6.2-8.56" />
          ) : (
            <>
              <path d="M20 11a8 8 0 1 0-2.34 5.66" />
              <path d="M20 4v7h-7" opacity={progress >= 1 ? 1 : 0.55} />
            </>
          )}
        </svg>
      </div>
      <span role="status" className="sr-only">
        {spinning ? t("refreshing") : ""}
      </span>
    </>
  );
}
