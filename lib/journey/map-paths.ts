import { latLngToPoint, type Point } from "@/lib/journey/geo";
import { NZ_LAKES, NZ_LAND, NZ_ROADS } from "@/lib/journey/nz-map-data";

/**
 * Turns the generated Natural Earth data (lib/journey/nz-map-data.ts, public
 * domain) into SVG path strings using the SAME projection as the stops
 * (geo.ts latLngToPoint), so land, roads and pins always agree. Islands are
 * not stretched: the projection is a plain equirectangular fit whose x/y
 * scale ratio is within ~2% of cos(latitude) across New Zealand
 * (map-paths.test.ts guards this).
 *
 * Everything is computed once, lazily, and memoised: the result is a few
 * strings and two polygons, shared by every map on the page.
 */

type LngLat = readonly [number, number];

function project([lng, lat]: LngLat): Point {
  return latLngToPoint({ latitude: lat, longitude: lng });
}

export function projectLine(line: readonly LngLat[]): Point[] {
  return line.map(project);
}

/** Two decimals, no trailing zeros: ~0.02 SVG units, far below a pixel. */
const num = (n: number) => String(Math.round(n * 100) / 100);

/** "M x y L x y ..." (optionally closed) for one polyline / polygon. */
export function pointsToPath(points: readonly Point[], closed = false): string {
  if (points.length === 0) return "";
  let d = `M${num(points[0].x)} ${num(points[0].y)}`;
  for (let i = 1; i < points.length; i += 1) {
    d += `L${num(points[i].x)} ${num(points[i].y)}`;
  }
  return closed ? `${d}Z` : d;
}

function area(poly: readonly Point[]): number {
  let sum = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    sum += (poly[j].x + poly[i].x) * (poly[j].y - poly[i].y);
  }
  return Math.abs(sum / 2);
}

export type MapPaths = {
  /** Every land ring (both main islands and the small islands). */
  land: string;
  lakes: string;
  majorRoads: string;
  secondaryRoads: string;
};

let paths: MapPaths | null = null;

export function getMapPaths(): MapPaths {
  paths ??= {
    land: NZ_LAND.map((l) => pointsToPath(projectLine(l.ring), true)).join(""),
    lakes: NZ_LAKES.map((l) => pointsToPath(projectLine(l.ring), true)).join(
      "",
    ),
    majorRoads: NZ_ROADS.filter((r) => r.kind === "major")
      .map((r) => pointsToPath(projectLine(r.line)))
      .join(""),
    secondaryRoads: NZ_ROADS.filter((r) => r.kind === "secondary")
      .map((r) => pointsToPath(projectLine(r.line)))
      .join(""),
  };
  return paths;
}

let islands: { north: Point[]; south: Point[] } | null = null;

/**
 * The outlines of the North and South Islands (the largest ring of each
 * name; the data also holds small offshore islands under the same names),
 * as projected polygons for the display-only pin layout.
 */
export function getMainIslands(): { north: Point[]; south: Point[] } {
  if (!islands) {
    const biggest = (name: string): Point[] => {
      let best: Point[] = [];
      let bestArea = -1;
      for (const land of NZ_LAND) {
        if (land.name !== name) continue;
        const poly = projectLine(land.ring);
        const a = area(poly);
        if (a > bestArea) {
          best = poly;
          bestArea = a;
        }
      }
      return best;
    };
    islands = {
      north: biggest("North Island"),
      south: biggest("South Island"),
    };
  }
  return islands;
}
