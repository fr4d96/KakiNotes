import type { Point } from "@/lib/journey/geo";

/**
 * Decorative city labels for the journey map. Proper nouns: deliberately
 * not translated. Tier 1 is always shown; tier 2 fades in once the camera is
 * zoomed in. `side` is the side of the dot the name sits on (chosen so the
 * name falls over water or open land rather than across the island).
 */
export type City = {
  name: string;
  latitude: number;
  longitude: number;
  tier: 1 | 2;
  side: "left" | "right";
};

export const CITIES: readonly City[] = [
  {
    name: "Auckland",
    latitude: -36.85,
    longitude: 174.76,
    tier: 1,
    side: "right",
  },
  {
    name: "Hamilton",
    latitude: -37.79,
    longitude: 175.28,
    tier: 2,
    side: "right",
  },
  {
    name: "Tauranga",
    latitude: -37.69,
    longitude: 176.17,
    tier: 2,
    side: "right",
  },
  {
    name: "Rotorua",
    latitude: -38.14,
    longitude: 176.25,
    tier: 2,
    side: "right",
  },
  {
    name: "Napier",
    latitude: -39.49,
    longitude: 176.91,
    tier: 2,
    side: "left",
  },
  {
    name: "Wellington",
    latitude: -41.29,
    longitude: 174.78,
    tier: 1,
    side: "right",
  },
  {
    name: "Nelson",
    latitude: -41.27,
    longitude: 173.28,
    tier: 2,
    side: "left",
  },
  {
    name: "Christchurch",
    latitude: -43.53,
    longitude: 172.64,
    tier: 1,
    side: "right",
  },
  {
    name: "Queenstown",
    latitude: -45.03,
    longitude: 168.66,
    tier: 2,
    side: "left",
  },
  {
    name: "Dunedin",
    latitude: -45.87,
    longitude: 170.5,
    tier: 2,
    side: "right",
  },
  {
    name: "Invercargill",
    latitude: -46.41,
    longitude: 168.35,
    tier: 2,
    side: "left",
  },
];

/** Tier-2 labels are fully visible from this zoom (1 = the whole of NZ)... */
export const TIER2_MIN_ZOOM = 1.6;
/** ...fading in over this much zoom before that. */
export const TIER2_FADE = 0.35;

/** Marker units (the label group is drawn at 1/zoom, like the pins). */
export const CITY_DOT_R = 1.3;
export const CITY_FONT = { 1: 5.2, 2: 4.4 } as const;
const CITY_TEXT_GAP = 2.6;

/** Opacity 0..1 of a city's label at a given camera zoom. */
export function cityZoomOpacity(tier: 1 | 2, zoom: number): number {
  return tier === 1 ? 1 : zoomFade(zoom, TIER2_MIN_ZOOM, TIER2_FADE);
}

/** 0 below `min - fade`, 1 from `min`, linear between. */
export function zoomFade(zoom: number, min: number, fade: number): number {
  return Math.max(0, Math.min(1, (zoom - (min - fade)) / fade));
}

export type Rect = { x0: number; y0: number; x1: number; y1: number };

/** Rough text width (the names are Latin; no measuring needed). */
export function cityTextWidth(name: string, tier: 1 | 2): number {
  return name.length * CITY_FONT[tier] * 0.56;
}

/** The label (dot + name) as a rectangle in marker units around the dot. */
export function cityLabelRect(city: City): Rect {
  const font = CITY_FONT[city.tier];
  const w = cityTextWidth(city.name, city.tier);
  const h = font * 0.62;
  return city.side === "right"
    ? { x0: -CITY_DOT_R, y0: -h, x1: CITY_TEXT_GAP + w, y1: h }
    : { x0: -CITY_TEXT_GAP - w, y0: -h, x1: CITY_DOT_R, y1: h };
}

export function cityTextX(city: City): number {
  return city.side === "right" ? CITY_TEXT_GAP : -CITY_TEXT_GAP;
}

/**
 * A stop's marker this close (marker units) to a label hides it. Must exceed
 * the highlighted dot's radius plus its white ring (DOT_R_LIT 3.4 + ring in
 * journey-map.tsx), or a dot just outside the box still covers the text.
 */
export const STOP_CLEARANCE = 6;

/**
 * True when a city label should be hidden because it would sit under a stop
 * or a name chip. Everything is in marker units RELATIVE TO THE CITY, i.e.
 * (position - city position) / (1 / zoom): stop offsets are points, chips
 * are rectangles.
 */
export function cityLabelCovered(
  label: Rect,
  stopOffsets: readonly Point[],
  chips: readonly Rect[],
  clearance: number = STOP_CLEARANCE,
): boolean {
  for (const s of stopOffsets) {
    if (
      s.x >= label.x0 - clearance &&
      s.x <= label.x1 + clearance &&
      s.y >= label.y0 - clearance &&
      s.y <= label.y1 + clearance
    ) {
      return true;
    }
  }
  for (const c of chips) {
    if (
      c.x0 < label.x1 &&
      c.x1 > label.x0 &&
      c.y0 < label.y1 &&
      c.y1 > label.y0
    ) {
      return true;
    }
  }
  return false;
}
