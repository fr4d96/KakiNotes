"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { usePrefersReducedMotion } from "@/lib/hooks/use-prefers-reduced-motion";

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
const FIELD_RIGHT = 0.94;
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
 * Nothing here moves on its own. The lattice settles once on load, then
 * only ever responds to input, so there is no autoplay to pause and no
 * WCAG 2.2.2 obligation. Under prefers-reduced-motion the settle is skipped
 * and the lens snaps instead of easing.
 *
 * The canvas is decoration (aria-hidden). The interactive layer is a plain
 * list of links positioned over it, so keyboard and screen-reader readers
 * get the same records as everyone else, in document order.
 */
export function HeroField({
  records,
  listLabel,
}: {
  records: HeroRecord[];
  listLabel: string;
}) {
  const reduced = usePrefersReducedMotion();
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
  });
  // Mirrored into a ref so the draw loop (which never re-subscribes) reads
  // the live value; written in an effect, never during render.
  const reducedRef = useRef(reduced);
  useEffect(() => {
    reducedRef.current = reduced;
  }, [reduced]);
  const positions = layoutPoints(records);

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

    function tick() {
      raf = null;
      const ease = reducedRef.current ? 1 : 0.14;
      state.x += (state.tx - state.x) * ease;
      state.y += (state.ty - state.y) * ease;
      state.strength += (state.tstrength - state.strength) * ease;
      if (state.settle < 1) state.settle = Math.min(1, state.settle + 0.02);
      draw();
      const moving =
        Math.abs(state.tx - state.x) > 0.2 ||
        Math.abs(state.ty - state.y) > 0.2 ||
        Math.abs(state.tstrength - state.strength) > 0.005 ||
        state.settle < 1;
      if (moving && state.inView && !document.hidden) schedule();
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
      aim(event.clientX, event.clientY);
    }
    function onPointerLeave() {
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

    return () => {
      if (raf !== null) window.cancelAnimationFrame(raf);
      plate.removeEventListener("pointermove", onPointerMove);
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
        <div className="hero-field-scrim" />
      </div>
      {records.length > 0 ? (
        // Above the text wrapper for hit-testing (it is a later sibling
        // that covers the whole plate), but pointer-events only on the
        // links themselves so the CTAs beneath stay clickable. The height
        // is the point band -- see FIELD_TOP/FIELD_BOTTOM.
        <ul
          aria-label={listLabel}
          className="pointer-events-none absolute inset-x-0 top-0 z-10 m-0 h-[24%] list-none p-0"
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
                // Labels open away from the nearer edge so none runs off
                // the plate; the CSS reads this attribute.
                data-side={left > 0.66 ? "end" : "start"}
                style={{ left: `${left * 100}%`, top: `${top * 100}%` }}
              >
                <Link
                  href={`/stories/${record.slug}`}
                  data-hero-point=""
                  aria-label={
                    record.record
                      ? `${record.title} — ${record.record}`
                      : record.title
                  }
                  className="hero-point pointer-events-auto"
                  style={{ animationDelay: `${600 + index * 45}ms` }}
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
    </>
  );
}
