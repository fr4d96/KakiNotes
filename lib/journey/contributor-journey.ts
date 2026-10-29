import { z } from "zod";
import type { JourneyStopView } from "@/lib/journey/schema";

// A contributor's journey: one pin per PUBLISHED New Zealand story
// (supabase/migrations/20261029091942_contributor_journey.sql). Pure: rows
// from get_published_contributor_journey() in, the map's stop list out.

/** numeric columns can arrive as numbers or strings; null/blank/NaN are rejected. */
const numeric = z
  .union([z.number(), z.string().trim().min(1)])
  .transform(Number)
  .pipe(z.number().finite());

export const publishedJourneyRowSchema = z.object({
  story_id: z.string().min(1),
  slug: z.string().min(1),
  title: z.string(),
  excerpt: z.string().nullable().optional(),
  parent_story_id: z.string().nullable().optional(),
  journey_label: z.string().trim().min(1),
  journey_latitude: numeric,
  journey_longitude: numeric,
  trip_start_date: z.string().nullable().optional(),
});

export type PublishedJourneyRow = z.infer<typeof publishedJourneyRowSchema>;

/** Zod-parses each row and drops the ones that do not parse. */
export function parsePublishedJourneyRows(
  rows: unknown,
): PublishedJourneyRow[] {
  if (!Array.isArray(rows)) return [];
  const out: PublishedJourneyRow[] = [];
  for (const row of rows) {
    const parsed = publishedJourneyRowSchema.safeParse(row);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

/** The public URL of a pinned story (app/(public)/stories/[id], keyed by slug). */
export function storyHref(slug: string): string {
  return `/stories/${encodeURIComponent(slug)}`;
}

/**
 * Rows (already in trip order) -> the stop list JourneyMap draws.
 *
 * - MAIN pins: rows with no parent, or whose parent is not in the set (or is
 *   itself a sub story -- folders are one level, so that is treated as a
 *   main pin rather than nested twice).
 * - SUB pins sit directly after their main pin, in trip order, and carry its
 *   index as `parentIndex` (always an EARLIER main index).
 * - Main pins keep trip order. The map itself has no cap on stops.
 */
export function buildJourneyStops(
  rows: readonly PublishedJourneyRow[],
): JourneyStopView[] {
  const byId = new Map(rows.map((r) => [r.story_id, r]));
  const isSub = (r: PublishedJourneyRow) => {
    const parent = r.parent_story_id ? byId.get(r.parent_story_id) : undefined;
    return (
      parent !== undefined &&
      parent.story_id !== r.story_id &&
      !(parent.parent_story_id && byId.has(parent.parent_story_id))
    );
  };
  const mains = rows.filter((r) => !isSub(r));
  const subsOf = new Map<string, PublishedJourneyRow[]>();
  for (const r of rows) {
    if (!isSub(r)) continue;
    const list = subsOf.get(r.parent_story_id as string) ?? [];
    list.push(r);
    subsOf.set(r.parent_story_id as string, list);
  }

  const view = (
    r: PublishedJourneyRow,
    parentIndex: number | null,
  ): JourneyStopView => ({
    latitude: r.journey_latitude,
    longitude: r.journey_longitude,
    label: r.journey_label,
    storyTitle: r.title,
    href: storyHref(r.slug),
    parentIndex,
  });

  const stops: JourneyStopView[] = [];
  for (const main of mains) {
    const mainIndex = stops.length;
    stops.push(view(main, null));
    for (const sub of subsOf.get(main.story_id) ?? []) {
      stops.push(view(sub, mainIndex));
    }
  }
  return stops;
}

/** One of the caller's own stories on their journey page (get_my_journey). */
export type MyJourneyEntry = {
  id: string;
  slug: string;
  title: string | null;
  lifecycleStatus: string;
  /** True only when published and in New Zealand -- the RPC enforces it again. */
  pinnable: boolean;
  isNewZealand: boolean;
  parentStoryId: string | null;
  place: { label: string; latitude: number; longitude: number } | null;
};

/**
 * The preview of the caller's journey, built from the same list the page
 * shows (so it updates as they edit): the pinned, pinnable entries, in the
 * list's trip order, through the same mapping the public page uses.
 */
export function buildMyJourneyStops(
  entries: readonly MyJourneyEntry[],
): JourneyStopView[] {
  const rows: PublishedJourneyRow[] = [];
  const pinned = new Set(
    entries.filter((e) => e.pinnable && e.place).map((e) => e.id),
  );
  for (const e of entries) {
    if (!e.pinnable || !e.place) continue;
    rows.push({
      story_id: e.id,
      slug: e.slug,
      title: e.title ?? e.slug,
      excerpt: null,
      parent_story_id:
        e.parentStoryId && pinned.has(e.parentStoryId) ? e.parentStoryId : null,
      journey_label: e.place.label,
      journey_latitude: e.place.latitude,
      journey_longitude: e.place.longitude,
      trip_start_date: null,
    });
  }
  return buildJourneyStops(rows);
}
