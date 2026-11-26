/**
 * Geometry for the story journey illustration.
 *
 * This is a PICTURE of a country (New Zealand, or Malaysia as a two-panel
 * inset), not a map: an equirectangular projection
 * over a fixed bounding box, scaled so the islands are not visibly
 * stretched. There are no tiles, no zoom and no geolocation anywhere in the
 * feature.
 *
 * NZ_BOUNDS here must stay in step with the CHECK constraints in
 * supabase/migrations/20261029042052_story_revision_stops.sql, which are the
 * enforcing boundary (this file is the friendly early check).
 */

import {
  JOURNEY_VIEWBOX,
  NZ_BOUNDS,
  resolveGeography,
  type GeographyArg,
  type JourneyPanel,
} from "@/lib/journey/geographies";

// NZ values, kept exported from here for back-compat. Every helper below takes
// an optional geography (or country) and defaults to New Zealand.
export { JOURNEY_VIEWBOX, NZ_BOUNDS };

export const MAX_JOURNEY_LABEL_LENGTH = 60;

export type LatLng = { latitude: number; longitude: number };
export type Point = { x: number; y: number };

export function isInsideNz({ latitude, longitude }: LatLng): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= NZ_BOUNDS.minLat &&
    latitude <= NZ_BOUNDS.maxLat &&
    longitude >= NZ_BOUNDS.minLng &&
    longitude <= NZ_BOUNDS.maxLng
  );
}

/** Two decimal places (~1 km). The database repeats this; it is authoritative. */
export function roundCoordinate(value: number): number {
  return Math.round(value * 100) / 100;
}

/** The panel a longitude is drawn in (the nearest one if it is in a gap). */
function panelForLng(panels: readonly JourneyPanel[], lng: number) {
  let best = panels[0];
  let bestGap = Infinity;
  for (const p of panels) {
    const gap = Math.max(p.bounds.minLng - lng, 0, lng - p.bounds.maxLng);
    if (gap < bestGap) {
      best = p;
      bestGap = gap;
    }
  }
  return best;
}

/** The panel an SVG point is in (the nearest rectangle if it is between). */
function panelForPoint(panels: readonly JourneyPanel[], { x, y }: Point) {
  let best = panels[0];
  let bestGap = Infinity;
  for (const p of panels) {
    const gap = Math.hypot(
      Math.max(p.x - x, 0, x - (p.x + p.width)),
      Math.max(p.y - y, 0, y - (p.y + p.height)),
    );
    if (gap < bestGap) {
      best = p;
      bestGap = gap;
    }
  }
  return best;
}

export function latLngToPoint(
  { latitude, longitude }: LatLng,
  geography?: GeographyArg,
): Point {
  const panel = panelForLng(resolveGeography(geography).panels, longitude);
  const { minLat, maxLat, minLng, maxLng } = panel.bounds;
  return {
    x: panel.x + ((longitude - minLng) / (maxLng - minLng)) * panel.width,
    y: panel.y + ((maxLat - latitude) / (maxLat - minLat)) * panel.height,
  };
}

/**
 * Inverse of latLngToPoint, rounded to 2 dp and clamped into the panel's
 * bounds so a tap on the very edge of the picture (or in the gap between
 * Malaysia's panels, which snaps to the nearer one) can never produce an
 * invalid stop.
 */
export function pointToLatLng(point: Point, geography?: GeographyArg): LatLng {
  const panel = panelForPoint(resolveGeography(geography).panels, point);
  const { minLat, maxLat, minLng, maxLng } = panel.bounds;
  const longitude =
    minLng + ((point.x - panel.x) / panel.width) * (maxLng - minLng);
  const latitude =
    maxLat - ((point.y - panel.y) / panel.height) * (maxLat - minLat);
  return {
    latitude: roundCoordinate(Math.min(maxLat, Math.max(minLat, latitude))),
    longitude: roundCoordinate(Math.min(maxLng, Math.max(minLng, longitude))),
  };
}

/**
 * The first / second main land mass of a geography. New Zealand: "north" and
 * "south" are the North and South Island. Malaysia: "north" is Peninsular
 * Malaysia (top panel), "south" is Borneo (bottom panel).
 */
export type Island = "north" | "south";

/**
 * Which main land mass a point is on. New Zealand: a single dividing line
 * down Cook Strait. Not a coastline test: a point in open water simply
 * lands on the nearer side.
 */
export function islandOf(point: LatLng, geography?: GeographyArg): Island {
  return resolveGeography(geography).landMassOf(point);
}

/** True when the leg joins the two main land masses. */
export function crossesCookStrait(
  a: LatLng,
  b: LatLng,
  geography?: GeographyArg,
): boolean {
  return islandOf(a, geography) !== islandOf(b, geography);
}

/** Per-leg flags: result[i] describes the leg from stops[i] to stops[i + 1]. */
export function cookStraitLegs(
  stops: LatLng[],
  geography?: GeographyArg,
): boolean[] {
  const legs: boolean[] = [];
  for (let i = 0; i < stops.length - 1; i += 1) {
    legs.push(crossesCookStrait(stops[i], stops[i + 1], geography));
  }
  return legs;
}

/** Generic names for the two functions above. */
export const crossesLandMasses = crossesCookStrait;
export const crossingLegs = cookStraitLegs;

/** True when an SVG point lies inside one of the geography's drawn panels. */
export function isInsidePanels(
  { x, y }: Point,
  geography?: GeographyArg,
): boolean {
  return resolveGeography(geography).panels.some(
    (p) => x >= p.x && x <= p.x + p.width && y >= p.y && y <= p.y + p.height,
  );
}
