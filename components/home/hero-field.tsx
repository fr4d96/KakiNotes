"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "@/lib/hooks/use-prefers-reduced-motion";
import { PauseIcon, PlayIcon } from "@/components/icons";

/**
 * One published story, reduced to what the first viewport shows of it. The
 * page builds these server-side with the request locale so the region name
 * is already in the reader's language -- this component never formats.
 */
export type HeroRecord = {
  slug: string;
  title: string;
  /** "Region · Work · Year" -- only the fields the story actually carries. */
  record: string;
};

/** Where the story points may sit, as fractions of the POINT BAND -- the
 *  strip across the top of the plate that the list element occupies. The
 *  band is 24% of the plate (set in CSS on the list): the bottom-anchored
 *  headline, sub, CTA row and rail leave roughly the top quarter free at
 *  every width, because the display size scales with the viewport just as
 *  the plate height does. Measured at 375x812 and 1024x700: the lowest
 *  point clears the headline at both. Points never sit under text. */
const FIELD_LEFT = 0.06;
// 0.86, not the old 0.94: the top-right corner of the band holds the
// ambient field's pause button, and no point may sit under it.
const FIELD_RIGHT = 0.86;
const FIELD_TOP = 0.12;
const FIELD_BOTTOM = 0.88;
const COLUMNS = 8;
/** Jitter as a fraction of a cell, each axis. ±30% keeps neighbouring dots
 *  at least ~40% of a cell apart, so on a phone (cells ~41px wide) two hit
 *  targets never sit on top of each other. */
const JITTER = 0.6;

// Lattice geometry and the pointer "lens", in CSS pixels.
const SPACING = 26;
const DOT_RADIUS = 1.15;
const LENS_RADIUS = 240;
const LENS_PULL = 11;
const BASE_ALPHA = 0.2;
const LENS_ALPHA = 0.55;

/** The point band's height as a fraction of the plate (matches the list's
 *  `h-[24%]` below), so the tour can aim the lens at a point in pixels. */
const POINT_BAND = 0.24;
// The reading light's tour. A spring, not an ease-out, so each glide starts
// as softly as it lands: k is the pull toward the next story, c the damping
// (≈ critical, 2√k, so it arrives without overshooting). Per 60Hz frame.
const TOUR_K = 0.0045;
const TOUR_C = 0.13;
const TOUR_STRENGTH = 0.9;
/** How long the light rests on a story with its record showing, in ms. */
const TOUR_DWELL = 2600;
/** Quiet time after the field settles before the first glide, in ms. */
const TOUR_START_DELAY = 900;
/** How long a touch or a departing pointer keeps the lens before the tour
 *  takes it back, in ms. */
const TOUCH_HOLD = 3200;
const POINTER_HOLD = 1500;

/**
 * The order the reading light visits the stories in: start at the newest
 * (the list's first record) and always go to the nearest one not yet
 * visited, so the light drifts across the field instead of jumping from
 * corner to corner. Pure, so it is computed once per record set.
 */
export function tourOrder(
  records: readonly { slug: string }[],
  positions: Map<string, { left: number; top: number }>,
  aspect: number,
): string[] {
  const remaining = records.map((record) => record.slug);
  const order: string[] = [];
  let current = remaining.shift();
  while (current !== undefined) {
    order.push(current);
    const from = positions.get(current);
    if (!from || remaining.length === 0) {
      current = remaining.shift();
      continue;
    }
    let best = 0;
    let bestDistance = Infinity;
    remaining.forEach((slug, index) => {
      const to = positions.get(slug);
      if (!to) return;
      // The band is wide and short: weigh x by the plate's aspect so
      // "nearest" means nearest on screen, not in fractions.
      const d = Math.hypot((to.left - from.left) * aspect, to.top - from.top);
      if (d < bestDistance) {
        bestDistance = d;
        best = index;
      }
    });
    current = remaining.splice(best, 1)[0];
  }
  return order;
}

/** FNV-1a. Not for security -- a stable, cheap way to turn a slug into a
 *  position that survives re-renders and re-deploys, so a story does not
 *  jump around the field between visits. */
function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Deterministic point positions: a jittered grid, not pure random. A grid
 * keeps 24 points from clumping into an unreadable knot; the per-slug
 * jitter stops it from reading as a grid.
 */
export function pointPosition(
  slug: string,
  index: number,
  total: number,
): { left: number; top: number } {
  const rows = Math.max(1, Math.ceil(total / COLUMNS));
  const columns = Math.min(COLUMNS, total);
  const col = index % columns;
  const row = Math.floor(index / columns);
  const h = hash(slug);
  const jx = ((h & 0xffff) / 0xffff - 0.5) * JITTER;
  const jy = (((h >>> 16) & 0xffff) / 0xffff - 0.5) * JITTER;
  const cellW = (FIELD_RIGHT - FIELD_LEFT) / columns;
  const cellH = (FIELD_BOTTOM - FIELD_TOP) / rows;
  return {
    left: FIELD_LEFT + (col + 0.5 + jx) * cellW,
    top: FIELD_TOP + (row + 0.5 + jy) * cellH,
  };
}

/**
 * Positions for a whole set, keyed by slug. Cells are handed out by the
 * RANK of each slug's hash, not by array index: the public query does not
 * promise a stable order between requests, and a story should not wander
 * across the field between one visit and the next. The DOM keeps the
 * query's order (newest first) for keyboard and screen-reader readers.
 */
export function layoutPoints(
  records: readonly { slug: string }[],
): Map<string, { left: number; top: number }> {
  const ranked = records
    .map((record) => ({ slug: record.slug, h: hash(record.slug) }))
    .sort((a, b) => a.h - b.h || a.slug.localeCompare(b.slug));
  const positions = new Map<string, { left: number; top: number }>();
  ranked.forEach(({ slug }, rank) => {
    positions.set(slug, pointPosition(slug, rank, ranked.length));
  });
  return positions;
}

function smoothstep(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/**
 * The landing hero's "night field": a dark plate of faint lattice points
 * that the reader's pointer bends and brightens like a lens, with every
 * published story sitting in it as a lit point you can hover, tap or tab
 * to. It replaced a Ken Burns stock-photo slideshow that was the one element
 * on the page not made of the record.
 *
 * With `ambient`, the field is alive on its own (2026-11-16: on a phone
 * there is no pointer, so a lens that only followed one left the plate a
 * still, faint grid). The lens becomes a reading light that tours the
 * stories -- gliding to each in turn, nearest first, lighting it and
 * showing its record for a moment before moving on -- and every story point
 * breathes. A pointer, a touch or keyboard focus takes the lens over; the
 * tour resumes a moment after it is let go. Because this moves for more
 * than five seconds, a pause button stops all of it (WCAG 2.2.2), and the
 * loop stops whenever the plate is off screen or the page is hidden.
 *
 * Without `ambient` (the closing share band), nothing moves on its own: the
 * lattice settles once, then only responds to input. Under
 * prefers-reduced-motion there is no tour and no breathing in either case,
 * the settle is skipped and the lens snaps instead of easing.
 *
 * The canvas is decoration (aria-hidden). The interactive layer is a plain
 * list of links positioned over it, so keyboard and screen-reader readers
 * get the same records as everyone else, in document order.
 */
export function HeroField({
  records,
  listLabel,
  scrim = "plate",
  ambient,
}: {
  records: HeroRecord[];
  /** Accessible name for the list of story points. Required when there are
   *  records; unused for a field with none. */
  listLabel?: string;
  /** Where the text this field sits under lives: bottom-left of the hero
   *  plate ("plate"), or the left of a full-width band ("band"). Picks the
   *  scrim that keeps that text calm. */
  scrim?: "plate" | "band";
  /** Bring the field to life: the reading-light tour and breathing points,
   *  with a pause button carrying these labels. Omit for a field that only
   *  responds to input. */
  ambient?: { pauseLabel: string; playLabel: string };
}) {
  const reduced = usePrefersReducedMotion();
  const [paused, setPaused] = useState(false);
  const listRef = useRef<HTMLUListElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Mutable lens state lives in a ref, not React state: it changes on every
  // pointer move and must never re-render the tree.
  const lens = useRef({
    x: 0,
    y: 0,
    tx: 0,
    ty: 0,
    strength: 0,
    tstrength: 0,
    settle: 0,
    inView: true,
    // The tour: lens velocity (spring), whether a mouse is over the plate,
    // and until when a touch / departed pointer keeps the lens.
    vx: 0,
    vy: 0,
    pointerInside: false,
    userUntil: 0,
    settledAt: 0,
    stop: 0,
    arrivedAt: 0,
    lit: null as string | null,
  });
  // Mirrored into a ref so the draw loop (which never re-subscribes) reads
  // the live value; written in an effect, never during render.
  const reducedRef = useRef(reduced);
  const pausedRef = useRef(paused);
  const kickRef = useRef<() => void>(() => {});
  useEffect(() => {
    reducedRef.current = reduced;
    pausedRef.current = paused;
    kickRef.current();
  }, [reduced, paused]);
  const positions = layoutPoints(records);
  const tourRef = useRef<{
    enabled: boolean;
    stops: { slug: string; left: number; top: number }[];
  }>({ enabled: false, stops: [] });
  useEffect(() => {
    const order = tourOrder(records, positions, 3);
    tourRef.current = {
      enabled: Boolean(ambient) && records.length > 0,
      stops: order.flatMap((slug) => {
        const at = positions.get(slug);
        return at ? [{ slug, ...at }] : [];
      }),
    };
    // positions is derived from records on every render; records is the
    // real input, so it is the only dependency that should re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, ambient]);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const state = lens.current;
    let raf: number | null = null;
    let width = 0;
    let height = 0;
    let dpr = 1;
    state.settle = reducedRef.current ? 1 : 0;

    function resize() {
      if (!root || !canvas) return;
      const rect = root.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      // Cap at 2x: a 4x-density phone would otherwise rasterise a 3000px
      // canvas for a ~1px dot lattice nobody can tell from 2x.
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      draw();
    }

    function draw() {
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const s = smoothstep(state.settle);
      const strength = state.strength;
      // Centre the lattice so the plate's edges do not show a half-row.
      const offsetX = ((width % SPACING) + SPACING) / 2;
      const offsetY = ((height % SPACING) + SPACING) / 2;
      for (let y = offsetY; y < height; y += SPACING) {
        for (let x = offsetX; x < width; x += SPACING) {
          let px = x;
          let py = y;
          let f = 0;
          if (strength > 0.001) {
            const dx = state.x - x;
            const dy = state.y - y;
            const d = Math.hypot(dx, dy);
            if (d < LENS_RADIUS) {
              f = smoothstep(1 - d / LENS_RADIUS) * strength;
              // Bend toward the pointer, never past it.
              const pull = (LENS_PULL * f) / Math.max(d, 1);
              px += dx * pull;
              py += dy * pull;
            }
          }
          // Settle: dots resolve from nothing, bottom of the plate last, so
          // the headline (which fades in on its own) is not raced by the
          // field above it.
          const settleHere = smoothstep(s * 1.6 - (y / height) * 0.6);
          if (settleHere <= 0) continue;
          const alpha = (BASE_ALPHA + LENS_ALPHA * f) * settleHere;
          // White-ish at rest; cyan only under the lens, where it is a
          // state, not a decoration (The One Accent Rule).
          const r = Math.round(226 + (53 - 226) * f);
          const g = Math.round(232 + (208 - 232) * f);
          const b = Math.round(240 + (196 - 240) * f);
          ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
          ctx.beginPath();
          ctx.arc(px, py, DOT_RADIUS + f * 0.9, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Light (or unlight) one story point: the CSS shows its record and
    // swells its dot exactly as hover/focus would.
    function light(slug: string | null) {
      if (state.lit === slug) return;
      const list = listRef.current;
      if (list && state.lit) {
        list
          .querySelector(`[data-hero-slug="${CSS.escape(state.lit)}"]`)
          ?.removeAttribute("data-touring");
      }
      if (list && slug) {
        list
          .querySelector(`[data-hero-slug="${CSS.escape(slug)}"]`)
          ?.setAttribute("data-touring", "");
      }
      state.lit = slug;
    }

    function touring(now: number) {
      const tour = tourRef.current;
      return (
        tour.enabled &&
        tour.stops.length > 0 &&
        !reducedRef.current &&
        !pausedRef.current &&
        !state.pointerInside &&
        now >= state.userUntil &&
        state.settle >= 1 &&
        now - state.settledAt >= TOUR_START_DELAY
      );
    }

    let last = 0;
    function tick(now: number) {
      raf = null;
      // Frame-rate independent: a 120Hz iPhone must not tour twice as fast.
      const steps = last
        ? Math.min(4, Math.max(1, Math.round((now - last) / 16.67)))
        : 1;
      last = now;

      if (state.settle < 1) {
        state.settle = Math.min(1, state.settle + 0.02 * steps);
        if (state.settle >= 1) state.settledAt = now;
      }

      if (touring(now)) {
        const stops = tourRef.current.stops;
        const stop = stops[state.stop % stops.length];
        state.tx = stop.left * width;
        state.ty = stop.top * height * POINT_BAND;
        state.tstrength = TOUR_STRENGTH;
        for (let i = 0; i < steps; i++) {
          state.vx += (state.tx - state.x) * TOUR_K - state.vx * TOUR_C;
          state.vy += (state.ty - state.y) * TOUR_K - state.vy * TOUR_C;
          state.x += state.vx;
          state.y += state.vy;
          state.strength += (state.tstrength - state.strength) * 0.05;
        }
        const near = Math.hypot(state.tx - state.x, state.ty - state.y) < 6;
        if (near && !state.arrivedAt) {
          state.arrivedAt = now;
          light(stop.slug);
        } else if (state.arrivedAt && now - state.arrivedAt > TOUR_DWELL) {
          light(null);
          state.arrivedAt = 0;
          state.stop += 1;
        }
      } else {
        // Input owns the lens (or the field is quiet): the original ease.
        light(null);
        state.arrivedAt = 0;
        state.vx = 0;
        state.vy = 0;
        if (
          tourRef.current.enabled &&
          (pausedRef.current || reducedRef.current) &&
          !state.pointerInside
        ) {
          state.tstrength = 0;
        }
        const ease = reducedRef.current ? 1 : 0.14;
        for (let i = 0; i < steps; i++) {
          state.x += (state.tx - state.x) * ease;
          state.y += (state.ty - state.y) * ease;
          state.strength += (state.tstrength - state.strength) * ease;
        }
      }
      draw();

      const now2 = performance.now();
      const waitingToTour =
        tourRef.current.enabled &&
        !reducedRef.current &&
        !pausedRef.current &&
        !state.pointerInside;
      const moving =
        touring(now2) ||
        waitingToTour ||
        Math.abs(state.tx - state.x) > 0.2 ||
        Math.abs(state.ty - state.y) > 0.2 ||
        Math.abs(state.tstrength - state.strength) > 0.005 ||
        state.settle < 1;
      if (moving && state.inView && !document.hidden) schedule();
      else last = 0;
    }

    // One frame at a time, and only while something is actually changing:
    // the loop stops on its own once the lens has settled, so an idle hero
    // costs nothing.
    function schedule() {
      if (raf === null) raf = window.requestAnimationFrame(tick);
    }

    function aim(clientX: number, clientY: number) {
      if (!root) return;
      const rect = root.getBoundingClientRect();
      state.tx = clientX - rect.left;
      state.ty = clientY - rect.top;
      state.tstrength = 1;
      schedule();
    }
    function onPointerMove(event: PointerEvent) {
      if (event.pointerType === "mouse") state.pointerInside = true;
      else state.userUntil = performance.now() + TOUCH_HOLD;
      aim(event.clientX, event.clientY);
    }
    // A touch is a pointer too: the lens jumps to the finger, and the tour
    // waits a moment after it lifts.
    function onPointerDown(event: PointerEvent) {
      if (event.pointerType === "mouse") return;
      state.userUntil = performance.now() + TOUCH_HOLD;
      aim(event.clientX, event.clientY);
    }
    function onPointerLeave(event?: Event) {
      const touch =
        event instanceof PointerEvent && event.pointerType !== "mouse";
      state.pointerInside = false;
      state.userUntil = performance.now() + (touch ? TOUCH_HOLD : POINTER_HOLD);
      state.tstrength = 0;
      schedule();
    }
    // Tabbing to a story point moves the lens onto it, so keyboard readers
    // see the same response a pointer gets.
    function onFocusIn(event: FocusEvent) {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const point = target.closest<HTMLElement>("[data-hero-point]");
      if (!point) return;
      // Keyboard focus owns the lens until it leaves the plate.
      state.userUntil = Number.POSITIVE_INFINITY;
      const rect = point.getBoundingClientRect();
      aim(rect.left + rect.width / 2, rect.top + rect.height / 2);
    }
    function onVisibility() {
      if (!document.hidden) schedule();
    }

    // The plate is the listener, not the canvas: the canvas sits under the
    // text wrapper and would never see the pointer.
    const plate = root.parentElement ?? root;
    plate.addEventListener("pointermove", onPointerMove);
    plate.addEventListener("pointerdown", onPointerDown);
    plate.addEventListener("pointerleave", onPointerLeave);
    plate.addEventListener("focusin", onFocusIn);
    plate.addEventListener("focusout", onPointerLeave);
    document.addEventListener("visibilitychange", onVisibility);

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => resize());
    resizeObserver?.observe(root);
    const intersection =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(([entry]) => {
            state.inView = entry.isIntersecting;
            if (entry.isIntersecting) schedule();
          });
    intersection?.observe(root);

    resize();
    schedule();
    // Pausing, playing or a reduced-motion change restarts the loop so the
    // lens can fade out or the tour pick up again.
    kickRef.current = schedule;

    return () => {
      kickRef.current = () => {};
      if (raf !== null) window.cancelAnimationFrame(raf);
      plate.removeEventListener("pointermove", onPointerMove);
      plate.removeEventListener("pointerdown", onPointerDown);
      plate.removeEventListener("pointerleave", onPointerLeave);
      plate.removeEventListener("focusin", onFocusIn);
      plate.removeEventListener("focusout", onPointerLeave);
      document.removeEventListener("visibilitychange", onVisibility);
      resizeObserver?.disconnect();
      intersection?.disconnect();
    };
  }, []);

  return (
    <>
      <div
        ref={rootRef}
        className="hero-field absolute inset-0 -z-10 overflow-hidden bg-[#020617]"
        aria-hidden="true"
      >
        <canvas ref={canvasRef} className="block h-full w-full" />
        <div
          className={
            scrim === "band" ? "hero-field-scrim--band" : "hero-field-scrim"
          }
        />
      </div>
      {records.length > 0 ? (
        // Above the text wrapper for hit-testing (it is a later sibling
        // that covers the whole plate), but pointer-events only on the
        // links themselves so the CTAs beneath stay clickable. The height
        // is the point band -- see FIELD_TOP/FIELD_BOTTOM.
        <ul
          ref={listRef}
          aria-label={listLabel}
          // Breathing points (CSS) only on an ambient field, and held still
          // while paused.
          data-ambient={ambient && !reduced ? "" : undefined}
          data-paused={paused ? "" : undefined}
          // A size container: each label caps its width at the room left
          // on its side of the plate (globals.css, 100cqw).
          className="pointer-events-none absolute inset-x-0 top-0 z-10 m-0 h-[24%] list-none p-0 [container-type:inline-size]"
        >
          {records.map((record, index) => {
            const { left, top } = positions.get(record.slug) ?? {
              left: 0.5,
              top: 0.25,
            };
            return (
              <li
                key={record.slug}
                className="absolute"
                // Labels open toward the wider side so none runs off the
                // plate (a phone plate is too narrow for a label to open
                // right from anywhere past the middle); the CSS reads this.
                data-side={left > 0.5 ? "end" : "start"}
                style={
                  {
                    left: `${left * 100}%`,
                    top: `${top * 100}%`,
                    "--x": left,
                  } as React.CSSProperties
                }
              >
                <Link
                  href={`/stories/${record.slug}`}
                  data-hero-point=""
                  data-hero-slug={record.slug}
                  aria-label={
                    record.record
                      ? `${record.title} — ${record.record}`
                      : record.title
                  }
                  className="hero-point pointer-events-auto"
                  style={
                    {
                      animationDelay: `${600 + index * 45}ms`,
                      // Each point breathes on its own beat, so the field
                      // shimmers rather than pulsing in unison.
                      "--breathe-delay": `${-((index * 1.37) % 4.6).toFixed(2)}s`,
                    } as React.CSSProperties
                  }
                >
                  <span className="hero-point-dot" aria-hidden="true" />
                  <span className="hero-point-label" aria-hidden="true">
                    <span className="block font-sans text-sm font-semibold text-white">
                      {record.title}
                    </span>
                    {record.record ? (
                      <span className="mt-0.5 block font-mono text-[0.66rem] tracking-[0.18em] text-white/60 uppercase">
                        {record.record}
                      </span>
                    ) : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
      {ambient && records.length > 0 && !reduced ? (
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-label={paused ? ambient.playLabel : ambient.pauseLabel}
          title={paused ? ambient.playLabel : ambient.pauseLabel}
          className="press absolute top-3 right-3 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-[#020617]/70 text-white/70 transition-colors after:absolute after:-inset-1 after:content-[''] hover:text-white sm:top-4 sm:right-4"
        >
          {paused ? (
            <PlayIcon className="h-4 w-4" />
          ) : (
            <PauseIcon className="h-4 w-4" />
          )}
        </button>
      ) : null}
    </>
  );
}
