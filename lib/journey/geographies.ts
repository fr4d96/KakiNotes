import type { City } from "@/lib/journey/cities";
import { CITIES, MY_CITIES } from "@/lib/journey/cities";
import type { LatLng } from "@/lib/journey/geo";
import { MY_LAKES, MY_LAND, MY_ROADS } from "@/lib/journey/my-map-data";
import { NZ_LAKES, NZ_LAND, NZ_ROADS } from "@/lib/journey/nz-map-data";

/**
 * The countries that have a journey map, and everything the map needs to
 * draw one: friendly bounds, the picture's size and panel layout, the
 * generated land data, the decorative cities and the "two main land masses"
 * logic (New Zealand: North/South Island; Malaysia: Peninsular/Borneo).
 *
 * The bounds MUST stay in step with the CHECK constraints in the database
 * (countries.journey_*): NZ in 20261029042052_story_revision_stops.sql,
 * Malaysia in 20261126090000_malaysia.sql. The database is authoritative;
 * this is the friendly early check.
 *
 * This file imports only TYPES from geo.ts so geo.ts can import it.
 */

export type JourneyCountry = "new-zealand" | "malaysia";

export type JourneyBounds = {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

/**
 * One drawn rectangle of the picture: the lat/lng box it shows and where it
 * sits in SVG space. New Zealand is one panel; Malaysia is an inset of two.
 */
export type JourneyPanel = {
  bounds: JourneyBounds;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type LngLat = readonly [number, number];
export type LandRing = {
  readonly name: string | null;
  readonly ring: readonly LngLat[];
};
export type RoadLine = {
  readonly kind: "major" | "secondary";
  readonly line: readonly LngLat[];
};

/** What carries a stop across the gap between the two main land masses. */
export type CrossingVehicle = "ferry" | "plane";

export type LandMass = "north" | "south";

export type JourneyGeography = {
  country: JourneyCountry;
  /** The whole accepted area (matches the database CHECKs). */
  bounds: JourneyBounds;
  viewBox: { width: number; height: number };
  panels: readonly JourneyPanel[];
  land: readonly LandRing[];
  lakes: readonly LandRing[];
  roads: readonly RoadLine[];
  cities: readonly City[];
  /** Names (in `land`) of the two main land masses; the biggest ring of each is used. */
  mainLandNames: { north: string; south: string };
  /** Which main land mass a point is nearer (display logic, not a coastline test). */
  landMassOf: (point: LatLng) => LandMass;
  /** What a leg between the two main land masses is drawn with. */
  crossingVehicle: CrossingVehicle;
  /** True when pins near the narrow gap between the land masses are pulled inland. */
  pullFromStrait: boolean;
};

export const NZ_BOUNDS: JourneyBounds = {
  minLat: -47.5,
  maxLat: -34.0,
  minLng: 166.0,
  maxLng: 178.9,
};

/** SVG user-space size of the New Zealand illustration. */
export const JOURNEY_VIEWBOX = { width: 220, height: 300 } as const;

export const MY_BOUNDS: JourneyBounds = {
  minLat: 0.8,
  maxLat: 7.5,
  minLng: 99.5,
  maxLng: 119.5,
};

/**
 * Malaysia inset: one common scale (21 SVG units per degree, both axes; at
 * ~4 degrees N cos(lat) is ~1) so Borneo and the peninsula keep their real
 * proportions. Peninsular panel on top, Borneo below, in a 220 x 300 picture.
 */
const MY_UNITS_PER_DEGREE = 21;
const MY_PANEL_HEIGHT = (7.5 - 0.8) * MY_UNITS_PER_DEGREE;
const MY_PANELS: readonly JourneyPanel[] = [
  {
    bounds: { minLat: 0.8, maxLat: 7.5, minLng: 99.5, maxLng: 104.8 },
    x: 4,
    y: 4,
    width: (104.8 - 99.5) * MY_UNITS_PER_DEGREE,
    height: MY_PANEL_HEIGHT,
  },
  {
    bounds: { minLat: 0.8, maxLat: 7.5, minLng: 109.4, maxLng: 119.5 },
    x: 4,
    y: 4 + MY_PANEL_HEIGHT + 9,
    width: (119.5 - 109.4) * MY_UNITS_PER_DEGREE,
    height: MY_PANEL_HEIGHT,
  },
];

/** Between the panels: the nearer one by longitude (Peninsular up to 107.1). */
const MY_PANEL_SPLIT_LNG = (104.8 + 109.4) / 2;

/** Cook Strait dividing line (through Farewell Spit and Cape Palliser). */
function nzLandMassOf({ latitude, longitude }: LatLng): LandMass {
  const dividingLat = -40.2 - 0.654 * (longitude - 172.7);
  return latitude > dividingLat ? "north" : "south";
}

export const NZ_GEOGRAPHY: JourneyGeography = {
  country: "new-zealand",
  bounds: NZ_BOUNDS,
  viewBox: JOURNEY_VIEWBOX,
  panels: [
    {
      bounds: NZ_BOUNDS,
      x: 0,
      y: 0,
      width: JOURNEY_VIEWBOX.width,
      height: JOURNEY_VIEWBOX.height,
    },
  ],
  land: NZ_LAND,
  lakes: NZ_LAKES,
  roads: NZ_ROADS,
  cities: CITIES,
  mainLandNames: { north: "North Island", south: "South Island" },
  landMassOf: nzLandMassOf,
  crossingVehicle: "ferry",
  pullFromStrait: true,
};

export const MY_GEOGRAPHY: JourneyGeography = {
  country: "malaysia",
  bounds: MY_BOUNDS,
  viewBox: { width: 220, height: 300 },
  panels: MY_PANELS,
  land: MY_LAND,
  lakes: MY_LAKES,
  roads: MY_ROADS,
  cities: MY_CITIES,
  mainLandNames: { north: "Peninsular Malaysia", south: "Sabah and Sarawak" },
  landMassOf: ({ longitude }) =>
    longitude < MY_PANEL_SPLIT_LNG ? "north" : "south",
  crossingVehicle: "plane",
  pullFromStrait: false,
};

const GEOGRAPHIES: Record<JourneyCountry, JourneyGeography> = {
  "new-zealand": NZ_GEOGRAPHY,
  malaysia: MY_GEOGRAPHY,
};

export function getJourneyGeography(country: JourneyCountry): JourneyGeography {
  return GEOGRAPHIES[country] ?? NZ_GEOGRAPHY;
}

/** Helpers take either a geography or just the country. */
export type GeographyArg = JourneyGeography | JourneyCountry;

export function resolveGeography(
  geo: GeographyArg | undefined,
): JourneyGeography {
  if (geo === undefined) return NZ_GEOGRAPHY;
  return typeof geo === "string" ? getJourneyGeography(geo) : geo;
}

function inBounds(b: JourneyBounds, { latitude, longitude }: LatLng): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= b.minLat &&
    latitude <= b.maxLat &&
    longitude >= b.minLng &&
    longitude <= b.maxLng
  );
}

/**
 * The friendly "is this inside the country's picture" check. For Malaysia
 * that means inside one of the two panels (the database's wider box also
 * covers the sea between them, which is not drawn).
 */
export function isInsideCountry(country: GeographyArg, point: LatLng): boolean {
  return resolveGeography(country).panels.some((p) =>
    inBounds(p.bounds, point),
  );
}
