import "server-only";
import { cache } from "react";
import { createPublicClient } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";
import { parseStopRows, type JourneyStopView } from "@/lib/journey/schema";

// Journey-map stops (supabase/migrations/20261029042052_story_revision_stops.sql).
//
// Every row is still re-validated with Zod (parseStopRows): numeric columns
// can arrive as strings, and a malformed row is dropped rather than drawn.
//
// FAIL SOFT, on purpose. A journey map is a decoration on a story. If the RPC
// is missing or errors, the story page must still
// render, so these return [] instead of throwing. The WRITE path
// (setRevisionStops) does NOT fail soft: a failed save must tell the
// contributor.

/**
 * The stops of the story's APPROVED, PUBLISHED revision, for anonymous
 * readers. The RPC itself returns nothing unless the story is publicly
 * visible (Rules 10-12); there is no way to ask it for a draft revision.
 */
async function fetchPublishedStoryStops(
  slug: string,
): Promise<JourneyStopView[]> {
  try {
    const { data, error } = await createPublicClient().rpc(
      "get_published_story_stops",
      { p_slug: slug },
    );
    if (error) return [];
    return parseStopRows(data);
  } catch {
    return [];
  }
}

/** Per-request dedupe only (never cached across requests), like the other public readers. */
export const getPublishedStoryStopsDeduped = cache(fetchPublishedStoryStops);

/**
 * The stops of one revision for the signed-in viewer entitled to see it
 * (editor, preview, moderation review). Authorization is the RPC's.
 */
export async function getRevisionStops(
  revisionId: string,
): Promise<JourneyStopView[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_revision_stops", {
      p_revision_id: revisionId,
    });
    if (error) return [];
    return parseStopRows(data);
  } catch {
    return [];
  }
}
