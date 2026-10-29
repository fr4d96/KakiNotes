import type { Point } from "@/lib/journey/geo";

/** One cubic Bezier piece of a route. */
export type BezierSegment = { from: Point; c1: Point; c2: Point; to: Point };

const fmt = (n: number) => String(Math.round(n * 100) / 100);

/**
 * Catmull-Rom spline through `points`, expressed as cubic Beziers (one per
 * leg) so SVG can draw it and getPointAtLength can drive along it. The curve
 * passes through every point; `tension` 0.5 gives the usual centripetal-ish
 * feel. End points reuse themselves as their missing neighbour.
 */
export function catmullRomSegments(
  points: Point[],
  tension = 0.5,
): BezierSegment[] {
  const segments: BezierSegment[] = [];
  const k = tension / 3;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? points[i + 1];
    segments.push({
      from: p1,
      c1: { x: p1.x + (p2.x - p0.x) * k, y: p1.y + (p2.y - p0.y) * k },
      c2: { x: p2.x - (p3.x - p1.x) * k, y: p2.y - (p3.y - p1.y) * k },
      to: p2,
    });
  }
  return segments;
}

/** "M x y C ..." for a single leg. */
export function segmentToPath(segment: BezierSegment): string {
  const { from, c1, c2, to } = segment;
  return `M${fmt(from.x)} ${fmt(from.y)}C${fmt(c1.x)} ${fmt(c1.y)} ${fmt(c2.x)} ${fmt(c2.y)} ${fmt(to.x)} ${fmt(to.y)}`;
}

/** The whole route as one SVG path string ("" for fewer than two points). */
export function smoothPath(points: Point[], tension = 0.5): string {
  const segments = catmullRomSegments(points, tension);
  if (segments.length === 0) return "";
  const [first, ...rest] = segments;
  return (
    segmentToPath(first) +
    rest
      .map(
        (s) =>
          `C${fmt(s.c1.x)} ${fmt(s.c1.y)} ${fmt(s.c2.x)} ${fmt(s.c2.y)} ${fmt(s.to.x)} ${fmt(s.to.y)}`,
      )
      .join("")
  );
}

/**
 * A closed, smoothed outline through `points` (used for the island
 * silhouettes). Wraps neighbours around instead of clamping.
 */
export function closedSmoothPath(points: Point[], tension = 0.5): string {
  const n = points.length;
  if (n < 3) return "";
  const k = tension / 3;
  let d = `M${fmt(points[0].x)} ${fmt(points[0].y)}`;
  for (let i = 0; i < n; i += 1) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    d += `C${fmt(p1.x + (p2.x - p0.x) * k)} ${fmt(p1.y + (p2.y - p0.y) * k)} ${fmt(p2.x - (p3.x - p1.x) * k)} ${fmt(p2.y - (p3.y - p1.y) * k)} ${fmt(p2.x)} ${fmt(p2.y)}`;
  }
  return `${d}Z`;
}
