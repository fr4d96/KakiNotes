"use server";

import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { setStoryJourneyPlace } from "@/lib/story/mutations";
import { storyJourneyErrorKey } from "@/lib/story/rpc-errors";
import { getMyJourney } from "@/lib/story/journey-queries";
import { journeyPlaceSchema } from "@/lib/journey/schema";
import {
  MAX_LINK_LENGTH,
  resolveGoogleMapsLink,
  type ResolveLinkResult,
} from "@/lib/journey/resolve-google-maps-link";
import {
  invalidateStoryPublicCache,
  invalidateStoryListingsPublicCache,
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
 * Server Components, so this is cheap.
 */
async function invalidateJourneyPublicCache(storyId: string) {
  revalidatePath("/contributors/[slug]", "page");
  revalidatePath("/contributors/[slug]/journey", "page");
  try {
    const mine = await getMyJourney();
    const slug = mine.find((s) => s.id === storyId)?.slug;
    if (slug) invalidateStoryPublicCache(slug);
    else invalidateStoryListingsPublicCache();
  } catch {
    // The write already committed; a cache hiccup must not look like a
    // failed save (same contract as the story folders action).
    invalidateStoryListingsPublicCache();
  }
}

/**
 * Pins one of the caller's published New Zealand stories on their journey
 * map, or (place === null) removes the pin. Public immediately, not
 * moderated -- the same documented exception as story folders. Only the
 * SHAPE of the input is checked here (Zod: label 1-60, coordinates inside New
 * Zealand); who owns the story, that it is published and in New Zealand, is
 * re-derived by set_story_journey_place() from the database, never taken
 * from the client (Engineering Rule 2). Its refusals map to translated
 * messages via storyJourneyErrorKey.
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

  let parsedPlace: z.infer<typeof journeyPlaceSchema> | null = null;
  if (place !== null) {
    const result = journeyPlaceSchema.safeParse(place);
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
export async function resolveGoogleMapsLinkAction(
  input: unknown,
): Promise<ResolveLinkResult | { ok: false; reason: "unauthenticated" }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, reason: "unauthenticated" };

  const parsed = mapsLinkInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };

  const result = await resolveGoogleMapsLink(parsed.data);
  if (!result.ok && result.reason === "unreachable") {
    console.warn("[journey] maps link resolve failed: unreachable");
  }
  return result;
}
