"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

export type StorySectionId =
  "story" | "photos" | "costs" | "sub-stories" | "related";

/**
 * The story page's section bar: Story · Photos · Costs · Sub stories ·
 * More stories, sticking under the header once the reader reaches it, with
 * the section they are in marked. Long stories with many sub stories run to
 * several phone screens; this keeps every part of the page one tap away
 * without hiding any of it behind tabs (the content stays one readable,
 * searchable, crawlable page).
 *
 * Plain in-page links: they work without JavaScript, land below the header
 * through `scroll-padding-top` plus each section's own scroll margin, and the
 * script below only adds the "you are here" mark. One passive scroll
 * listener, read in an animation frame, never on every event.
 */
const LABEL_KEY = {
  story: "story",
  photos: "photos",
  costs: "costs",
  "sub-stories": "subStories",
  related: "related",
} as const satisfies Record<StorySectionId, string>;

export function StorySectionNav({ sections }: { sections: StorySectionId[] }) {
  const t = useTranslations("story.sections");
  const [active, setActive] = useState<StorySectionId>(sections[0]);
  const barRef = useRef<HTMLDivElement>(null);
  const linkRefs = useRef(new Map<StorySectionId, HTMLAnchorElement>());

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const bar = barRef.current;
      if (!bar) return;
      // A section counts as "current" once its top has passed the bottom of
      // this bar, with a little slack so a jump lands on the right pill.
      const line = bar.getBoundingClientRect().bottom + 24;
      let current = sections[0];
      for (const id of sections) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) current = id;
      }
      // At the very bottom the last short section may never reach the line.
      const doc = document.documentElement;
      if (window.innerHeight + window.scrollY >= doc.scrollHeight - 4) {
        current = sections[sections.length - 1];
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    // First read in a frame too, not synchronously in the effect.
    frame = requestAnimationFrame(update);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [sections]);

  // Keep the current pill in view inside the (sideways-scrolling) bar.
  // scrollTo on the bar itself, never scrollIntoView, which would also
  // move the page.
  useEffect(() => {
    const bar = barRef.current;
    const link = linkRefs.current.get(active);
    if (!bar || !link) return;
    const left = link.offsetLeft - 16;
    const right = link.offsetLeft + link.offsetWidth + 16 - bar.clientWidth;
    if (bar.scrollLeft > left) bar.scrollTo?.({ left, behavior: "smooth" });
    else if (bar.scrollLeft < right)
      bar.scrollTo?.({ left: right, behavior: "smooth" });
  }, [active]);

  if (sections.length < 2) return null;

  return (
    <nav
      aria-label={t("label")}
      className="sticky top-[calc(76px+env(safe-area-inset-top))] z-30 -mx-4 mt-6 border-b border-border-subtle bg-background sm:-mx-6"
    >
      <div
        ref={barRef}
        className="nf-scroll-x flex gap-1 overflow-x-auto px-4 py-2 sm:px-6"
      >
        {sections.map((id) => {
          const current = id === active;
          return (
            <a
              key={id}
              ref={(el) => {
                if (el) linkRefs.current.set(id, el);
                else linkRefs.current.delete(id);
              }}
              href={`#${id}`}
              aria-current={current ? "location" : undefined}
              onClick={() => setActive(id)}
              className={`press relative inline-flex min-h-9 shrink-0 items-center rounded-full px-3.5 text-sm font-semibold whitespace-nowrap transition-colors duration-200 after:absolute after:inset-x-0 after:-inset-y-1 after:content-[''] ${
                current
                  ? "bg-tag-background text-tag-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t(LABEL_KEY[id])}
            </a>
          );
        })}
      </div>
    </nav>
  );
}
