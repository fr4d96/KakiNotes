import { JOURNEY_VIEWBOX, type Point } from "@/lib/journey/geo";
import { getMainIslands } from "@/lib/journey/map-paths";
import { distToPolygon, pointInPolygon } from "@/lib/journey/polygon";

/** Drawn pin radius incl. stroke (the enlarged/selected state). */
export const PIN_OUTER_RADIUS = 9.8;
/** Furthest a pin is moved inland to keep Cook Strait visible. */
export const MAX_STRAIT_PULL = 12;

let strait: number | null = null;
/** Narrowest gap (SVG units) between the two main islands' outlines. */
export function straitWidth(): number {
  if (strait === null) {
    const { north, south } = getMainIslands();
    strait = Infinity;
    for (const p of north) strait = Math.min(strait, distToPolygon(p, south));
  }
  return strait;
}

/**
 * DISPLAY-ONLY. A pin whose circle would cover the water gap between the two
 * main islands (Wellington / Picton) is moved onto the interior of its OWN
 * island - the nearest spot (within `MAX_STRAIT_PULL`) that is inside that
 * island's outline and whose circle stays at least half the strait's width
 * clear of the other island (plus 5 units of air). Pins away from the strait are returned as-is.
 */
export function pullInlandFromStrait(
  points: readonly Point[],
  radius: number = PIN_OUTER_RADIUS,
): Point[] {
  const { north, south } = getMainIslands();
  const gap = straitWidth();
  // Half the strait plus a little air, so open water shows between circles.
  const need = radius + gap / 2 + 5;

  return points.map((p) => {
    const dn = pointInPolygon(p, north) ? 0 : distToPolygon(p, north);
    const ds = pointInPolygon(p, south) ? 0 : distToPolygon(p, south);
    const own = dn <= ds ? north : south;
    const other = dn <= ds ? south : north;
    const ok = (q: Point) =>
      pointInPolygon(q, own) && distToPolygon(q, other) >= need;
    if (distToPolygon(p, other) >= need && pointInPolygon(p, own)) {
      return { ...p };
    }
    if (Math.min(dn, ds) > radius + gap) return { ...p };

    let best: Point | null = null;
    let bestScore = Infinity;
    let fallback = { ...p };
    let fallbackClear = -Infinity;
    for (let r = 0.5; r <= MAX_STRAIT_PULL + 1e-9; r += 0.5) {
      for (let k = 0; k < 72; k += 1) {
        const a = (k / 72) * Math.PI * 2;
        const q = { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r };
        if (!pointInPolygon(q, own)) continue;
        const clear = distToPolygon(q, other);
        if (clear > fallbackClear) {
          fallbackClear = clear;
          fallback = q;
        }
        if (ok(q) && r < bestScore) {
          bestScore = r;
          best = q;
        }
      }
      if (best) break;
    }
    return best ?? fallback;
  });
}

/**
 * DISPLAY-ONLY pin separation. Returns new points in which no two are closer
 * than `minDistance` (SVG units), by pushing overlapping pairs apart along
 * the line between them. The stored coordinates are never touched: this only
 * decides where the little numbered circles are drawn so they stay legible
 * (e.g. Wellington and Picton sit ~15 units apart on the illustration).
 *
 * Deterministic, and a no-op for points that are already far enough apart.
 * Best effort: a very dense cluster may still end up slightly under the
 * minimum once clamped into the picture.
 */
export function spreadPins(
  points: readonly Point[],
  minDistance: number,
  bounds: { width: number; height: number } = JOURNEY_VIEWBOX,
  pinRadius: number = PIN_OUTER_RADIUS,
): Point[] {
  // Strait pull first, then overlap spreading; repeat so they settle together.
  let out = pullInlandFromStrait(points, pinRadius);
  const margin = minDistance / 2;

  for (let round = 0; round < 3; round += 1) {
    out = separate(out, minDistance, bounds, margin);
    const pulled = pullInlandFromStrait(out, pinRadius);
    const same = pulled.every(
      (p, i) => Math.hypot(p.x - out[i].x, p.y - out[i].y) < 1e-6,
    );
    out = pulled;
    if (same) break;
  }
  return out;
}

function separate(
  input: readonly Point[],
  minDistance: number,
  bounds: { width: number; height: number },
  margin: number,
): Point[] {
  const out = input.map((p) => ({ ...p }));
  for (let pass = 0; pass < 24; pass += 1) {
    let moved = false;
    for (let i = 0; i < out.length; i += 1) {
      for (let j = i + 1; j < out.length; j += 1) {
        const dx = out[j].x - out[i].x;
        const dy = out[j].y - out[i].y;
        const dist = Math.hypot(dx, dy);
        if (dist >= minDistance - 1e-6) continue;
        // Coincident points get a deterministic direction from their index.
        const angle = dist < 1e-9 ? (j - i) * 2.399963 : Math.atan2(dy, dx);
        const push = (minDistance - dist) / 2 + 0.01;
        const ux = Math.cos(angle);
        const uy = Math.sin(angle);
        out[i].x -= ux * push;
        out[i].y -= uy * push;
        out[j].x += ux * push;
        out[j].y += uy * push;
        moved = true;
      }
    }
    for (const p of out) {
      p.x = Math.min(bounds.width - margin, Math.max(margin, p.x));
      p.y = Math.min(bounds.height - margin, Math.max(margin, p.y));
    }
    if (!moved) break;
  }
  return out;
}
