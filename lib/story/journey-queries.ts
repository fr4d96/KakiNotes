import "server-only";
import { cache } from "react";
import { z } from "zod";
import { createPublicClient } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";
import {
  buildJourneyStops,
  parsePublishedJourneyRows,
  type MyJourneyEntry,
  type PublishedJourneyRow,
} from "@/lib/journey/contributor-journey";
import type { JourneyStopView } from "@/lib/journey/schema";

// Contributor journey (supabase/migrations/20261029091942_contributor_journey.sql).
//
// Every row is still re-validated with Zod: numeric columns can arrive as
// strings, and a malformed row is dropped rather than drawn.
//
// The PUBLIC reader FAILS SOFT, on purpose. A journey map is a decoration on
// a profile: if the RPC is missing or errors, the profile must still render,
// so it returns [] instead of throwing. The WRITE path (setStoryJourneyPlace)
// does NOT fail soft: a failed save must tell the contributor.

/**
 * The pins of a contributor's journey for anonymous readers, in trip order.
 * The RPC itself returns only publicly visible New Zealand stories (Rules
 * 10-12); there is no way to ask it for a draft or private story.
 */
async function fetchPublishedContributorJourney(
  contributorId: string,
): Promise<PublishedJourneyRow[]> {
  try {
    const { data, error } = await createPublicClient().rpc(
      "get_published_contributor_journey",
      { p_contributor_id: contributorId },
    );
    if (error) return [];
    return parsePublishedJourneyRows(data);
  } catch {
    return [];
  }
}

/** Per-request dedupe only (never cached across requests), like the other public readers. */
export const getPublishedContributorJourney = cache(
  fetchPublishedContributorJourney,
);

/** The same pins as the stop list the map draws. */
export async function getPublishedContributorJourneyStops(
  contributorId: string,
): Promise<JourneyStopView[]> {
  return buildJourneyStops(await getPublishedContributorJourney(contributorId));
}

const numeric = z
  .union([z.number(), z.string().trim().min(1)])
  .transform(Number)
  .pipe(z.number().finite());

const myJourneyRowSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string().nullable(),
  lifecycle_status: z.string(),
  pinnable: z.boolean(),
  is_new_zealand: z.boolean(),
  parent_story_id: z.string().nullable(),
  journey_label: z.string().nullable(),
  journey_latitude: numeric.nullable(),
  journey_longitude: numeric.nullable(),
});

/**
 * Owner only (the RPC checks ownership itself). Backs the contributor's
 * journey page. Throws on error, like getMyStoryFolders(): the page has an
 * error boundary and an empty list would read as "you have no stories".
 */
export async function getMyJourney(): Promise<MyJourneyEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_journey");
  if (error) throw error;
  const entries: MyJourneyEntry[] = [];
  for (const raw of data ?? []) {
    const parsed = myJourneyRowSchema.safeParse(raw);
    if (!parsed.success) continue;
    const r = parsed.data;
    entries.push({
      id: r.id,
      slug: r.slug,
      title: r.title,
      lifecycleStatus: r.lifecycle_status,
      pinnable: r.pinnable,
      isNewZealand: r.is_new_zealand,
      parentStoryId: r.parent_story_id,
      place:
        r.journey_label !== null &&
        r.journey_latitude !== null &&
        r.journey_longitude !== null
          ? {
              label: r.journey_label,
              latitude: r.journey_latitude,
              longitude: r.journey_longitude,
            }
          : null,
    });
  }
  return entries;
}
