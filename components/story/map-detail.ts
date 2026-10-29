import type { Point } from "@/lib/journey/geo";
import type { CameraBox } from "@/lib/journey/camera";
import {
  cityLabelCovered,
  cityZoomOpacity,
  zoomFade,
  type Rect,
} from "@/lib/journey/cities";

/**
 * Shared by the reader's journey map and the contributor's stops editor:
 * viewBox formatting and the zoom-dependent base-map detail (city names,
 * secondary roads), both written straight to the DOM with the camera.
 */

/** Secondary roads fade in from this zoom (see JourneyBackdrop). */
const SECONDARY_ROADS_ZOOM = 1.5;

export const fmt = (n: number) => Math.round(n * 1000) / 1000;

export function boxAttr(b: CameraBox) {
  return `${fmt(b.x)} ${fmt(b.y)} ${fmt(b.w)} ${fmt(b.h)}`;
}

const rectOf = (value: string | undefined): Rect | null => {
  const n = (value ?? "").split(" ").map(Number);
  return n.length === 4 && n.every(Number.isFinite)
    ? { x0: n[0], y0: n[1], x1: n[2], y1: n[3] }
    : null;
};

/**
 * Zoom-dependent base-map detail, written straight to the DOM with the
 * camera (no React state): city names are drawn at 1/zoom, tier 2 fades in
 * when zoomed in, secondary roads likewise, and a name is hidden while a stop
 * marker or a name chip would cover it (everything compared in marker units,
 * i.e. screen-proportional, relative to the city).
 */
export function applyMapDetail(
  svg: SVGSVGElement,
  k: number,
  stops: readonly Point[],
) {
  const zoom = 1 / k;
  svg.querySelectorAll<SVGGElement>("[data-roads='secondary']").forEach((g) => {
    g.style.opacity = String(fmt(zoomFade(zoom, SECONDARY_ROADS_ZOOM, 0.3)));
  });
  const cities = svg.querySelectorAll<SVGGElement>("[data-city]");
  if (cities.length === 0) return;
  const chips: { at: Point; rect: Rect }[] = [];
  svg.querySelectorAll<SVGGElement>("[data-chip]").forEach((chip) => {
    const rect = rectOf(chip.dataset.chip);
    const pin = chip.closest<SVGGElement>("[data-pin]");
    if (rect && pin) {
      chips.push({
        at: { x: Number(pin.dataset.px), y: Number(pin.dataset.py) },
        rect,
      });
    }
  });
  cities.forEach((g) => {
    const cx = Number(g.dataset.px);
    const cy = Number(g.dataset.py);
    g.setAttribute("transform", `translate(${cx} ${cy}) scale(${k})`);
    const label = rectOf(g.dataset.rect);
    const tier = g.dataset.tier === "1" ? 1 : 2;
    let opacity = cityZoomOpacity(tier, zoom);
    if (label && opacity > 0) {
      const offsets = stops.map((p) => ({
        x: (p.x - cx) / k,
        y: (p.y - cy) / k,
      }));
      const chipRects = chips.map(({ at, rect }) => {
        const ox = (at.x - cx) / k;
        const oy = (at.y - cy) / k;
        return {
          x0: rect.x0 + ox,
          y0: rect.y0 + oy,
          x1: rect.x1 + ox,
          y1: rect.y1 + oy,
        };
      });
      if (cityLabelCovered(label, offsets, chipRects)) opacity = 0;
    }
    g.style.opacity = String(fmt(opacity));
  });
}
