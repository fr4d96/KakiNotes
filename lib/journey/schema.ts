import { z } from "zod";
import {
  MAX_JOURNEY_LABEL_LENGTH,
  MAX_JOURNEY_MAIN_STOPS,
  MAX_JOURNEY_STOPS,
  MAX_SUB_STOPS_PER_MAIN,
  NZ_BOUNDS,
  roundCoordinate,
} from "@/lib/journey/geo";

/**
 * A stop's anchor is the bare slug of a heading in the story (see
 * lib/story/headings.ts) -- never raw user HTML, never whitespace or '#'.
 * Mirrors story_revision_stops_anchor_shape.
 */
export const sectionAnchorSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[^\s#]+$/);

const latitude = z
  .number("story.journeyOutOfBounds")
  .min(NZ_BOUNDS.minLat, "story.journeyOutOfBounds")
  .max(NZ_BOUNDS.maxLat, "story.journeyOutOfBounds")
  .transform(roundCoordinate);

const longitude = z
  .number("story.journeyOutOfBounds")
  .min(NZ_BOUNDS.minLng, "story.journeyOutOfBounds")
  .max(NZ_BOUNDS.maxLng, "story.journeyOutOfBounds")
  .transform(roundCoordinate);

/**
 * One stop as the contributor submits it. The label is plain text (React
 * escapes it on render); coordinates are rounded here for friendliness and
 * AGAIN, authoritatively, inside set_revision_stops().
 */
export const journeyStopSchema = z.object({
  latitude,
  longitude,
  label: z
    .string()
    .trim()
    .min(1, "story.journeyLabelRequired")
    .max(MAX_JOURNEY_LABEL_LENGTH, "story.journeyLabelTooLong"),
  sectionAnchor: sectionAnchorSchema.nullable().optional(),
  /**
   * 0-based position, in the same array, of the MAIN stop this stop sits
   * inside; null/absent for a main stop. Re-validated by set_revision_stops().
   */
  parentIndex: z.number().int().min(0).nullable().optional(),
});

/**
 * Hierarchy rules, mirrored from set_revision_stops(): a parent must be an
 * EARLIER element that is itself a main stop (one level), at most 12 main
 * stops, 8 sub-stops per main stop, 40 in total.
 */
export const journeyStopsSchema = z
  .array(journeyStopSchema)
  .max(MAX_JOURNEY_STOPS, "story.journeyTooMany")
  .superRefine((stops, ctx) => {
    const perParent = new Map<number, number>();
    let mains = 0;
    stops.forEach((stop, i) => {
      const parent = stop.parentIndex ?? null;
      if (parent === null) {
        mains += 1;
        return;
      }
      const target = parent < i ? stops[parent] : undefined;
      if (!target || (target.parentIndex ?? null) !== null) {
        ctx.addIssue({
          code: "custom",
          message: "story.journeyBadParent",
          path: [i, "parentIndex"],
        });
        return;
      }
      perParent.set(parent, (perParent.get(parent) ?? 0) + 1);
    });
    if (mains > MAX_JOURNEY_MAIN_STOPS) {
      ctx.addIssue({ code: "custom", message: "story.journeyTooMany" });
    }
    for (const n of perParent.values()) {
      if (n > MAX_SUB_STOPS_PER_MAIN) {
        ctx.addIssue({ code: "custom", message: "story.journeyTooManyInside" });
        break;
      }
    }
  });

export type JourneyStop = z.infer<typeof journeyStopSchema>;

/** A stop as the readers' components use it. Always fully populated. */
export type JourneyStopView = {
  latitude: number;
  longitude: number;
  label: string;
  sectionAnchor: string | null;
  /** Index (into the same array) of the main stop this sits inside; null = main stop. */
  parentIndex: number | null;
};

/**
 * Rows as get_published_story_stops() / get_revision_stops() return them
 * (snake_case; numeric may arrive as a number or a string). Anything that
 * does not parse is dropped rather than rendered half-broken.
 */
const stopRowSchema = z.object({
  sort_order: z.coerce.number().int(),
  latitude: z.coerce.number(),
  longitude: z.coerce.number(),
  label: z.string(),
  section_anchor: z.string().nullable().optional(),
  parent_sort_order: z.coerce.number().int().nullable().optional(),
});

export function parseStopRows(rows: unknown): JourneyStopView[] {
  if (!Array.isArray(rows)) return [];
  const parsed: Array<z.infer<typeof stopRowSchema>> = [];
  for (const row of rows) {
    const result = stopRowSchema.safeParse(row);
    if (result.success && result.data.label.trim() !== "") {
      parsed.push(result.data);
    }
  }
  parsed.sort((a, b) => a.sort_order - b.sort_order);
  const mainSortOrders = new Set(
    parsed.filter((r) => r.parent_sort_order == null).map((r) => r.sort_order),
  );
  // Keep a main stop, and a sub-stop only when its parent is a kept main stop
  // that comes EARLIER; orphaned or nested sub-stops are dropped.
  const kept = parsed.filter(
    (r) =>
      r.parent_sort_order == null ||
      (mainSortOrders.has(r.parent_sort_order) &&
        r.parent_sort_order < r.sort_order),
  );
  const keptIndex = new Map<number, number>();
  kept.forEach((r, i) => keptIndex.set(r.sort_order, i));
  return kept.map((r) => ({
    latitude: r.latitude,
    longitude: r.longitude,
    label: r.label,
    sectionAnchor: r.section_anchor ?? null,
    parentIndex:
      r.parent_sort_order == null
        ? null
        : (keptIndex.get(r.parent_sort_order) ?? null),
  }));
}

/** Stops that make up the route (the map needs at least 2 of these). */
export function countMainStops(stops: readonly JourneyStopView[]): number {
  return stops.filter((s) => s.parentIndex === null).length;
}
