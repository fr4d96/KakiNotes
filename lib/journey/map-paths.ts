import { latLngToPoint, type Point } from "@/lib/journey/geo";
import {
  resolveGeography,
  type GeographyArg,
  type JourneyCountry,
  type JourneyGeography,
} from "@/lib/journey/geographies";

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

export function projectLine(
  line: readonly LngLat[],
  geography?: GeographyArg,
): Point[] {
  return line.map(([lng, lat]) =>
    latLngToPoint({ latitude: lat, longitude: lng }, geography),
  );
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

const paths = new Map<JourneyCountry, MapPaths>();

export function getMapPaths(geography?: GeographyArg): MapPaths {
  const geo = resolveGeography(geography);
  let cached = paths.get(geo.country);
  if (!cached) {
    const ring = (l: { ring: readonly LngLat[] }) =>
      pointsToPath(projectLine(l.ring, geo), true);
    const road = (kind: "major" | "secondary") =>
      geo.roads
        .filter((r) => r.kind === kind)
        .map((r) => pointsToPath(projectLine(r.line, geo)))
        .join("");
    cached = {
      land: geo.land.map(ring).join(""),
      lakes: geo.lakes.map(ring).join(""),
      majorRoads: road("major"),
      secondaryRoads: road("secondary"),
    };
    paths.set(geo.country, cached);
  }
  return cached;
}

const islands = new Map<JourneyCountry, { north: Point[]; south: Point[] }>();

function panelPolygon(geo: JourneyGeography, index: number): Point[] {
  const p = geo.panels[Math.min(index, geo.panels.length - 1)];
  return [
    { x: p.x, y: p.y },
    { x: p.x + p.width, y: p.y },
    { x: p.x + p.width, y: p.y + p.height },
    { x: p.x, y: p.y + p.height },
  ];
}

/**
 * The outlines of the two main land masses (the largest ring of each
 * name; the data also holds small offshore islands under the same names),
 * as projected polygons for the display-only pin layout. New Zealand: North
 * and South Island. Malaysia: Peninsular and Borneo (named "north"/"south").
 */
export function getMainIslands(geography?: GeographyArg): {
  north: Point[];
  south: Point[];
} {
  const geo = resolveGeography(geography);
  let cached = islands.get(geo.country);
  if (!cached) {
    const biggest = (name: string, fallback: number): Point[] => {
      let best: Point[] = [];
      let bestArea = -1;
      for (const land of geo.land) {
        if (land.name !== name) continue;
        const poly = projectLine(land.ring, geo);
        const a = area(poly);
        if (a > bestArea) {
          best = poly;
          bestArea = a;
        }
      }
      return best.length > 0 ? best : panelPolygon(geo, fallback);
    };
    cached = {
      north: biggest(geo.mainLandNames.north, 0),
      south: biggest(geo.mainLandNames.south, 1),
    };
    islands.set(geo.country, cached);
  }
  return cached;
}

/** Generic name for getMainIslands. */
export const getMainLandMasses = getMainIslands;
