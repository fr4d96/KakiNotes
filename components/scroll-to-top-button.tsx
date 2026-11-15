"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronIcon } from "@/components/icons";

/** How close to the bottom (px) counts as "reached the bottom". */
const NEAR_BOTTOM_PX = 320;
/** A page shorter than this many px of scroll never needs the button. */
const MIN_SCROLLED_PX = 600;

/**
 * A round "back to top" button that appears once the reader has scrolled to
 * the bottom of a long page (the Stories list, a long story), floating just
 * above the bottom tab bar on a phone and in the corner from md up. One tap
 * scrolls smoothly back to the top (instantly under reduced motion).
 *
 * Rendered by BottomTabBar, so it lives in exactly the layouts that have the
 * tab bar, and is left out where the bar is hidden: the story editor and
 * while typing (it would float over the iOS keyboard).
 *
 * Hidden, it stays mounted but faded out, inert and out of the tab order, so
 * showing it never shifts layout and a keyboard user never lands on it.
 */
export function ScrollToTopButton() {
  const t = useTranslations("common");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const doc = document.documentElement;
        const scrolled = window.scrollY;
        const nearBottom =
          scrolled + window.innerHeight >= doc.scrollHeight - NEAR_BOTTOM_PX;
        setVisible(scrolled > MIN_SCROLLED_PX && nearBottom);
      });
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <button
      type="button"
      aria-label={t("backToTop")}
      title={t("backToTop")}
      inert={!visible}
      data-visible={visible ? "true" : "false"}
      onClick={() => {
        const reduce =
          typeof window.matchMedia === "function" &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        window.scrollTo({ top: 0, behavior: reduce ? "instant" : "smooth" });
      }}
      className={`press fixed right-4 bottom-[calc(3.5rem+env(safe-area-inset-bottom)+1rem)] z-30 flex h-12 w-12 items-center justify-center rounded-full border border-border-subtle bg-surface text-foreground shadow-lg transition-[opacity,transform] duration-200 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none md:right-6 md:bottom-6 print:hidden ${
        visible
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-2 opacity-0"
      }`}
    >
      <ChevronIcon className="h-5 w-5 -rotate-90" />
    </button>
  );
}
