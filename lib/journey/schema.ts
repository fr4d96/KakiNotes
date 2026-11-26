import { z } from "zod";
import { MAX_JOURNEY_LABEL_LENGTH, roundCoordinate } from "@/lib/journey/geo";
import {
  getJourneyGeography,
  isInsideCountry,
  type JourneyCountry,
} from "@/lib/journey/geographies";

const OUT_OF_BOUNDS = "story.journeyOutOfBounds";

/**
 * The place a contributor pins a story at, as submitted, for one country. The
 * label is plain text (React escapes it on render); coordinates are rounded
 * here for friendliness and AGAIN, authoritatively, inside
 * set_story_journey_place(). "Inside" means inside one of the country's
 * drawn panels (one for New Zealand, two for Malaysia).
 */
export function journeyPlaceSchemaFor(country: JourneyCountry) {
  const { bounds } = getJourneyGeography(country);
  return z
    .object({
      latitude: z
        .number(OUT_OF_BOUNDS)
        .min(bounds.minLat, OUT_OF_BOUNDS)
        .max(bounds.maxLat, OUT_OF_BOUNDS)
        .transform(roundCoordinate),
      longitude: z
        .number(OUT_OF_BOUNDS)
        .min(bounds.minLng, OUT_OF_BOUNDS)
        .max(bounds.maxLng, OUT_OF_BOUNDS)
        .transform(roundCoordinate),
      label: z
        .string()
        .trim()
        .min(1, "story.journeyLabelRequired")
        .max(MAX_JOURNEY_LABEL_LENGTH, "story.journeyLabelTooLong"),
    })
    .refine((p) => isInsideCountry(country, p), {
      message: OUT_OF_BOUNDS,
      path: ["longitude"],
    });
}

/** New Zealand (kept for existing callers). */
export const journeyPlaceSchema = journeyPlaceSchemaFor("new-zealand");

export type JourneyPlace = z.infer<typeof journeyPlaceSchema>;

/**
 * A pin as the readers' map uses it. Always fully populated. Each pin is a
 * PLACE tied to one published story: `href` opens that story and
 * `storyTitle` is shown beside the place label.
 */
export type JourneyStopView = {
  latitude: number;
  longitude: number;
  label: string;
  storyTitle: string;
  href: string;
  /** Index (into the same array) of the main stop this sits inside; null = main stop. */
  parentIndex: number | null;
};
