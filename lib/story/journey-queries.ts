import "server-only";
import { cache } from "react";
import { createPublicClient } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";
import { callUntypedRpc } from "@/lib/supabase/call-untyped-rpc";
import { parseStopRows, type JourneyStopView } from "@/lib/journey/schema";

// Journey-map stops (supabase/migrations/20261029042052_story_revision_stops.sql).
//
// The migration is applied, but these RPCs are not in types/database.ts yet:
// regenerating it from the hosted database also pulls in schema from
// branches not merged to main (countries, trips), which breaks typecheck
// here. So they go through callUntypedRpc() until those branches land, and
// every row is re-validated with Zod (parseStopRows) -- the cast removes
// typing, not runtime safety.
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
    const rows = await callUntypedRpc<unknown>(
      createPublicClient(),
      "get_published_story_stops",
      { p_slug: slug },
    );
    return parseStopRows(rows);
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
    const rows = await callUntypedRpc<unknown>(supabase, "get_revision_stops", {
      p_revision_id: revisionId,
    });
    return parseStopRows(rows);
  } catch {
    return [];
  }
}
