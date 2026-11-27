"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

export type StorySectionId =
  "story" | "photos" | "costs" | "sub-stories" | "related";

/**
 * The story page's section bar: Story · Photos · Costs · Sub stories ·
 * More stories, sticking under the header once the reader reaches it, with
 * the section they are in marked by a sliding thumb. Long stories with many sub stories run to
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

  if (sections.length < 2) return null;

  const index = Math.max(0, sections.indexOf(active));

  return (
    <nav
      aria-label={t("label")}
      className="sticky top-[calc(76px+env(safe-area-inset-top))] z-30 -mx-4 mt-6 border-b border-border-subtle bg-background px-4 py-2 sm:-mx-6 sm:px-6"
    >
      {/* Equal columns, like a segmented switch: every section fits the
          screen at once (owner, 2026-11-27: no sideways swiping), and one
          recess thumb slides to the section being read. */}
      <div
        ref={barRef}
        className="relative isolate grid rounded-full border border-border-subtle p-0.5"
        style={{
          gridTemplateColumns: `repeat(${sections.length}, minmax(0, 1fr))`,
        }}
      >
        <span
          aria-hidden="true"
          className="absolute inset-y-0.5 left-0.5 -z-10 rounded-full bg-surface-muted transition-transform duration-300 ease-out motion-reduce:transition-none"
          style={{
            width: `calc((100% - 0.25rem) / ${sections.length})`,
            transform: `translateX(${index * 100}%)`,
          }}
        />
        {sections.map((id) => {
          const current = id === active;
          return (
            <a
              key={id}
              href={`#${id}`}
              aria-current={current ? "location" : undefined}
              onClick={() => setActive(id)}
              className={`press relative flex min-h-9 min-w-0 items-center justify-center rounded-full px-1 text-sm leading-tight font-semibold transition-colors duration-200 after:absolute after:inset-x-0 after:-inset-y-1 after:content-[''] ${
                current
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="truncate">{t(LABEL_KEY[id])}</span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}
