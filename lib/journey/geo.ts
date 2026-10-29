/**
 * Geometry for the story journey illustration.
 *
 * This is a PICTURE of New Zealand, not a map: an equirectangular projection
 * over a fixed bounding box, scaled so the islands are not visibly
 * stretched. There are no tiles, no zoom and no geolocation anywhere in the
 * feature.
 *
 * NZ_BOUNDS here must stay in step with the CHECK constraints in
 * supabase/migrations/20261029042052_story_revision_stops.sql, which are the
 * enforcing boundary (this file is the friendly early check).
 */

export const NZ_BOUNDS = {
  minLat: -47.5,
  maxLat: -34.0,
  minLng: 166.0,
  maxLng: 178.9,
} as const;

/** SVG user-space size of the illustration. */
export const JOURNEY_VIEWBOX = { width: 220, height: 300 } as const;

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

export function latLngToPoint({ latitude, longitude }: LatLng): Point {
  const { width, height } = JOURNEY_VIEWBOX;
  return {
    x:
      ((longitude - NZ_BOUNDS.minLng) / (NZ_BOUNDS.maxLng - NZ_BOUNDS.minLng)) *
      width,
    y:
      ((NZ_BOUNDS.maxLat - latitude) / (NZ_BOUNDS.maxLat - NZ_BOUNDS.minLat)) *
      height,
  };
}

/**
 * Inverse of latLngToPoint, rounded to 2 dp and clamped into the bounds so a
 * tap on the very edge of the picture can never produce an invalid stop.
 */
export function pointToLatLng({ x, y }: Point): LatLng {
  const { width, height } = JOURNEY_VIEWBOX;
  const longitude =
    NZ_BOUNDS.minLng + (x / width) * (NZ_BOUNDS.maxLng - NZ_BOUNDS.minLng);
  const latitude =
    NZ_BOUNDS.maxLat - (y / height) * (NZ_BOUNDS.maxLat - NZ_BOUNDS.minLat);
  return {
    latitude: roundCoordinate(
      Math.min(NZ_BOUNDS.maxLat, Math.max(NZ_BOUNDS.minLat, latitude)),
    ),
    longitude: roundCoordinate(
      Math.min(NZ_BOUNDS.maxLng, Math.max(NZ_BOUNDS.minLng, longitude)),
    ),
  };
}

export type Island = "north" | "south";

/**
 * Which island a point is on, by a single dividing line down Cook Strait
 * (through roughly Farewell Spit and Cape Palliser). Good enough to decide
 * "ferry or campervan" for an illustration; it is not a coastline test, so
 * a point in open water simply lands on the nearer side.
 */
export function islandOf({ latitude, longitude }: LatLng): Island {
  const dividingLat = -40.2 - 0.654 * (longitude - 172.7);
  return latitude > dividingLat ? "north" : "south";
}

/** True when the leg joins the North Island to the South Island. */
export function crossesCookStrait(a: LatLng, b: LatLng): boolean {
  return islandOf(a) !== islandOf(b);
}

/** Per-leg flags: result[i] describes the leg from stops[i] to stops[i + 1]. */
export function cookStraitLegs(stops: LatLng[]): boolean[] {
  const legs: boolean[] = [];
  for (let i = 0; i < stops.length - 1; i += 1) {
    legs.push(crossesCookStrait(stops[i], stops[i + 1]));
  }
  return legs;
}
