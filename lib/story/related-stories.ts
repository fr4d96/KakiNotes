/**
 * Related stories for a story page (2026-11-18): ranked by what a candidate
 * shares with the story being read, not just "newest in the same region".
 *
 *   same destination (e.g. Queenstown)  3 points each
 *   same region (e.g. Otago)            2 points each
 *   shared tag (e.g. Tourism)           1 point each
 *
 * Highest score first; ties go to the newer story (candidates arrive newest
 * first, and the sort is stable). Stories that share nothing only fill
 * empty slots, newest first, so the section is never emptier than before.
 * Names are compared case- and space-insensitively, and a free-text place
 * ("Wharariki Beach") matches the same free text on another story.
 *
 * Pure: the caller hands in already-public, published candidates (the
 * country's newest, via list_published_stories) and removes nothing it
 * shouldn't; this only orders them. Exclusions (the story itself, its sub
 * stories) are applied BEFORE picking, so they never leave a gap.
 */

type PlaceEntry = {
  region_name?: string | null;
  destination_name?: string | null;
};

export type RelatedCandidate = {
  story_id: string;
  regions?: unknown;
  tags?: unknown;
};

export type RelatedSource = { regions?: unknown; tags?: unknown };

const DESTINATION_POINTS = 3;
const REGION_POINTS = 2;
const TAG_POINTS = 1;

function norm(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function places(regions: unknown): {
  regions: Set<string>;
  destinations: Set<string>;
} {
  const result = {
    regions: new Set<string>(),
    destinations: new Set<string>(),
  };
  if (!Array.isArray(regions)) return result;
  for (const entry of regions as PlaceEntry[]) {
    const region = entry?.region_name;
    const destination = entry?.destination_name;
    if (typeof region === "string" && region.trim()) {
      result.regions.add(norm(region));
      if (typeof destination === "string" && destination.trim()) {
        // A destination is only "the same place" within the same region.
        result.destinations.add(`${norm(region)}|${norm(destination)}`);
      }
    }
  }
  return result;
}

function tags(value: unknown): Set<string> {
  if (!Array.isArray(value)) return new Set();
  return new Set(
    value
      .filter((v): v is string => typeof v === "string" && v.trim() !== "")
      .map(norm),
  );
}

function overlap(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const item of a) if (b.has(item)) count += 1;
  return count;
}

/** How much `candidate` has in common with `source`. 0 = nothing. */
export function relatedScore(
  source: RelatedSource,
  candidate: RelatedCandidate,
): number {
  const from = places(source.regions);
  const to = places(candidate.regions);
  return (
    overlap(from.destinations, to.destinations) * DESTINATION_POINTS +
    overlap(from.regions, to.regions) * REGION_POINTS +
    overlap(tags(source.tags), tags(candidate.tags)) * TAG_POINTS
  );
}

/**
 * Up to `limit` candidates, best match first. `candidates` must be newest
 * first; `excludeIds` (the story itself, its sub stories) are skipped.
 */
export function pickRelatedStories<T extends RelatedCandidate>(
  source: RelatedSource,
  candidates: readonly T[],
  {
    limit = 3,
    excludeIds = new Set<string>(),
  }: {
    limit?: number;
    excludeIds?: ReadonlySet<string>;
  } = {},
): T[] {
  const seen = new Set<string>();
  const scored = candidates
    .filter((c) => {
      if (excludeIds.has(c.story_id) || seen.has(c.story_id)) return false;
      seen.add(c.story_id);
      return true;
    })
    .map((candidate, index) => ({
      candidate,
      index,
      score: relatedScore(source, candidate),
    }));
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.slice(0, limit).map((s) => s.candidate);
}
