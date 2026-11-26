"use server";

import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { setStoryJourneyPlace } from "@/lib/story/mutations";
import { storyJourneyErrorKey } from "@/lib/story/rpc-errors";
import { getMyJourney } from "@/lib/story/journey-queries";
import { journeyPlaceSchemaFor } from "@/lib/journey/schema";
import {
  JOURNEY_COUNTRY_SLUGS,
  hasJourneyMap,
  isCountrySlug,
} from "@/lib/story/countries";
import {
  MAX_LINK_LENGTH,
  resolveGoogleMapsLink,
  type ResolveLinkResult,
} from "@/lib/journey/resolve-google-maps-link";
import {
  invalidateStoryPagesOnly,
  invalidateStoryListingPagesOnly,
} from "@/lib/story/public-cache";
import { firstIssueMessage } from "@/lib/validation/issue-messages";
import { getErrorMessage } from "@/lib/errors";
import { logAppEvent } from "@/lib/log";

export type JourneyActionResult =
  | {
      ok: true;
      place: { label: string; latitude: number; longitude: number } | null;
    }
  | { ok: false; error: string };

const storyIdSchema = z.uuid();

/**
 * Re-derives the story's slug from the OWNER-scoped get_my_journey() -- never
 * a client-supplied slug -- and refreshes everything a pin change touches: the
 * story page (its "See this on ... journey" link), and the contributor's
 * profile and journey pages. The contributor's own slug is not known here, so
 * the dynamic route patterns are revalidated; both pages are uncached
 * Server Components, so this is cheap. No photo purge: a pin changes no photo.
 */
async function invalidateJourneyPublicCache(storyId: string) {
  revalidatePath("/contributors/[slug]", "page");
  revalidatePath("/contributors/[slug]/journey", "page");
  revalidatePath("/my/contributors/[slug]", "page");
  revalidatePath("/my/contributors/[slug]/journey", "page");
  try {
    const mine = await getMyJourney();
    const slug = mine.find((s) => s.id === storyId)?.slug;
    if (slug) invalidateStoryPagesOnly(slug);
    else invalidateStoryListingPagesOnly();
  } catch {
    // The write already committed; a cache hiccup must not look like a
    // failed save (same contract as the story folders action).
    invalidateStoryListingPagesOnly();
  }
}

/**
 * Pins one of the caller's published stories on their journey map for the
 * story's own country (New Zealand or Malaysia), or (place === null) removes
 * the pin. Public immediately, not moderated -- the same documented exception
 * as story folders. The story's country comes from the OWNER-scoped
 * get_my_journey(), never the client; the SHAPE of the input is checked
 * against that country's map here (Zod: label 1-60, coordinates inside it).
 * Who owns the story, that it is published and that the pin is inside its
 * country are re-derived by set_story_journey_place() and the
 * stories_validate_journey_place trigger (Engineering Rule 2). Refusals map
 * to translated messages via storyJourneyErrorKey.
 */
export async function setStoryJourneyPlaceAction(
  storyId: unknown,
  place: unknown,
): Promise<JourneyActionResult> {
  const [tErr, tCommon, tv] = await Promise.all([
    getTranslations("actionErrors"),
    getTranslations("common"),
    getTranslations("validation"),
  ]);
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: tCommon("mustBeSignedIn") };

  const parsedStory = storyIdSchema.safeParse(storyId);
  if (!parsedStory.success) {
    return { ok: false, error: tErr("invalidStory") };
  }

  let parsedPlace: z.infer<ReturnType<typeof journeyPlaceSchemaFor>> | null =
    null;
  if (place !== null) {
    // A friendly early check only; the database is the authority. A story
    // not in the caller's list (or in a country with no map) is left to the
    // RPC, which refuses it with WHV11 / WHV17.
    const mine = await getMyJourney().catch(() => []);
    const storyCountry = mine.find(
      (s) => s.id === parsedStory.data,
    )?.countrySlug;
    const country =
      storyCountry && isCountrySlug(storyCountry) && hasJourneyMap(storyCountry)
        ? storyCountry
        : "new-zealand";
    const result = journeyPlaceSchemaFor(country).safeParse(place);
    if (!result.success) {
      return {
        ok: false,
        error: firstIssueMessage(result.error, tv, "common.invalidInput"),
      };
    }
    parsedPlace = result.data;
  }

  try {
    await setStoryJourneyPlace(parsedStory.data, parsedPlace);
  } catch (error) {
    const key = storyJourneyErrorKey(error);
    return {
      ok: false,
      error: key ? tErr(key) : getErrorMessage(error, tErr("generic")),
    };
  }

  revalidatePath("/my-stories/journey");
  revalidatePath("/my-stories/journey/[storyId]", "page");
  revalidatePath("/my-stories");
  await invalidateJourneyPublicCache(parsedStory.data);
  logAppEvent({
    event: parsedPlace ? "story.journey.set" : "story.journey.cleared",
    target: parsedStory.data,
    outcome: "success",
  });
  // What the database now holds is the rounded copy; echo ours (also rounded
  // by the schema) so the page can update without a refetch.
  return { ok: true, place: parsedPlace };
}

const mapsLinkInputSchema = z.string().trim().min(1).max(MAX_LINK_LENGTH);

/**
 * Turns a pasted Google Maps link into a place (coordinates + name) for the
 * journey place picker. Needs a signed-in user but no story: it never touches
 * the database. For a short link (maps.app.goo.gl) the server makes one
 * outbound request to Google to read the redirect target (see
 * lib/journey/resolve-google-maps-link.ts for the SSRF guard). The link is
 * never stored or logged; at most the failure reason is.
 */
const journeyCountrySchema = z.enum(JOURNEY_COUNTRY_SLUGS).catch("new-zealand");

export async function resolveGoogleMapsLinkAction(
  input: unknown,
  country?: unknown,
): Promise<ResolveLinkResult | { ok: false; reason: "unauthenticated" }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, reason: "unauthenticated" };

  const parsed = mapsLinkInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };

  // Which country's map the place must fall inside. Only a convenience for
  // the picker (nothing is stored here), so a client-supplied value is fine.
  const result = await resolveGoogleMapsLink(
    parsed.data,
    journeyCountrySchema.parse(country),
  );
  if (!result.ok && result.reason === "unreachable") {
    console.warn("[journey] maps link resolve failed: unreachable");
  }
  return result;
}
