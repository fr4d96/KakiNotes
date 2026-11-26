"use client";

import Link from "next/link";
import { useState } from "react";
import { PauseIcon, PlayIcon } from "@/components/icons";
import { usePrefersReducedMotion } from "@/lib/hooks/use-prefers-reduced-motion";

/** One published story's cover, as the home hero's photo wall shows it. */
export type WallTile = {
  slug: string;
  title: string;
  /** The story's first place, in the reader's language; may be empty. */
  place: string;
  /** A ready-to-use image URL (already sized by the caller). */
  url: string;
};

/** Columns drawn at the widest size; fewer show on smaller screens (CSS). */
const COLUMNS = 5;
/** Photos per column before the column repeats. */
const PER_COLUMN = 6;
/** Pinterest-style varied heights, cycled per tile so the columns stagger. */
const SHAPES = [
  "aspect-[3/4]",
  "aspect-square",
  "aspect-[4/5]",
  "aspect-[2/3]",
];
/** Seconds for one full loop per column: unequal, so the wall never syncs. */
const DURATIONS = [52, 64, 58, 70, 61];

/**
 * Each column's photos: the whole set, rotated by a different stride per
 * column so neighbouring columns never show the same story side by side,
 * then cut to PER_COLUMN (repeating a short set until it fills).
 */
export function wallColumns<T>(tiles: readonly T[]): T[][] {
  if (tiles.length === 0) return [];
  return Array.from({ length: COLUMNS }, (_, column) => {
    const out: T[] = [];
    const start = (column * 3) % tiles.length;
    for (let i = 0; out.length < PER_COLUMN; i++) {
      out.push(
        tiles[(start + i * 2 + Math.floor(i / tiles.length)) % tiles.length],
      );
    }
    return out;
  });
}

/**
 * The home hero (2026-11-17 redesign, Pinterest-like): a wall of real
 * published stories' photos in soft rounded tiles of varied heights, the
 * columns drifting slowly in alternating directions and looping seamlessly,
 * fading out at the top and bottom edges. A tap opens that story.
 *
 * Motion is CSS only (a transform per column), so it runs on the
 * compositor: hovering the wall stops it so a photo holds still under the
 * pointer, the pause button stops it for good (it moves for more than five
 * seconds, WCAG 2.2.2), and under prefers-reduced-motion it never starts.
 *
 * The wall is decorative for assistive tech: every story it shows is also
 * in "Latest stories" right below as a proper list, so the wall is
 * aria-hidden and its links are out of the tab order -- otherwise the
 * duplicated, looping tiles would read the same stories several times over.
 */
export function PhotoWall({
  tiles,
  pauseLabel,
  playLabel,
  basePath = "/stories",
}: {
  tiles: WallTile[];
  pauseLabel: string;
  playLabel: string;
  /** The country's story pages ("/stories" NZ, "/my/stories" Malaysia). */
  basePath?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const [paused, setPaused] = useState(false);
  const columns = wallColumns(tiles);
  if (columns.length === 0) return null;

  return (
    <div
      className="photo-wall relative h-full w-full"
      data-paused={paused || reduced ? "" : undefined}
    >
      <div
        aria-hidden="true"
        className="photo-wall-mask grid h-full grid-cols-3 gap-2.5 overflow-hidden sm:grid-cols-4 sm:gap-3 xl:grid-cols-5"
      >
        {columns.map((column, c) => (
          <div
            key={c}
            className={`min-w-0 ${c === 3 ? "hidden sm:block" : ""} ${
              c === 4 ? "hidden xl:block" : ""
            }`}
          >
            <div
              className="photo-wall-column flex flex-col gap-2.5 sm:gap-3"
              data-direction={c % 2 === 0 ? "up" : "down"}
              style={
                {
                  "--wall-duration": `${DURATIONS[c % DURATIONS.length]}s`,
                  // Start each column part-way through its loop so the wall
                  // opens already staggered, not lined up at the top.
                  "--wall-delay": `-${(c * 7.3).toFixed(1)}s`,
                } as React.CSSProperties
              }
            >
              {/* Two copies back to back: the column slides by exactly one
                  copy's height (-50%) and loops without a seam. */}
              {[0, 1].map((copy) =>
                column.map((tile, i) => (
                  <Link
                    key={`${copy}-${i}-${tile.slug}`}
                    href={`${basePath}/${tile.slug}`}
                    tabIndex={-1}
                    draggable={false}
                    className={`photo-wall-tile group relative block overflow-hidden rounded-2xl bg-surface-muted ${
                      SHAPES[(c + i) % SHAPES.length]
                    }`}
                    style={{ animationDelay: `${120 + (c * 3 + i) * 55}ms` }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element --
                        the /media proxy already serves sized card versions */}
                    <img
                      src={tile.url}
                      alt=""
                      loading={copy === 0 && i < 3 ? "eager" : "lazy"}
                      decoding="async"
                      draggable={false}
                      className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
                    />
                    {/* Only the town (the first part of "Queenstown,
                        Otago"), and only from sm up: a phone tile is
                        ~105px wide, where every caption truncated to
                        noise. */}
                    {tile.place ? (
                      <span className="absolute bottom-2 left-2 hidden max-w-[calc(100%-1rem)] truncate rounded-full bg-black/55 px-2 py-0.5 text-xs font-semibold text-white sm:block">
                        {tile.place.split(",")[0]}
                      </span>
                    ) : null}
                  </Link>
                )),
              )}
            </div>
          </div>
        ))}
      </div>
      {!reduced ? (
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-label={paused ? playLabel : pauseLabel}
          title={paused ? playLabel : pauseLabel}
          className="press absolute right-2 bottom-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-surface/90 text-foreground/75 shadow-sm transition-colors after:absolute after:-inset-1 after:content-[''] hover:text-foreground"
        >
          {paused ? (
            <PlayIcon className="h-4 w-4" />
          ) : (
            <PauseIcon className="h-4 w-4" />
          )}
        </button>
      ) : null}
    </div>
  );
}
