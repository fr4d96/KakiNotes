import { z } from "zod";
import {
  MAX_JOURNEY_LABEL_LENGTH,
  NZ_BOUNDS,
  roundCoordinate,
} from "@/lib/journey/geo";

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
 * The place a contributor pins a story at, as submitted. The label is plain
 * text (React escapes it on render); coordinates are rounded here for
 * friendliness and AGAIN, authoritatively, inside set_story_journey_place().
 */
export const journeyPlaceSchema = z.object({
  latitude,
  longitude,
  label: z
    .string()
    .trim()
    .min(1, "story.journeyLabelRequired")
    .max(MAX_JOURNEY_LABEL_LENGTH, "story.journeyLabelTooLong"),
});

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
