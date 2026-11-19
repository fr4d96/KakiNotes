/**
 * Pure sort logic for the contributor "My Stories" list. No React, no I/O: the
 * view feeds it the already-filtered stories of one section and gets a new
 * array back (the input is never mutated).
 *
 * Direction is "asc" | "desc" for every key; what that means to a reader is
 * spelled out per key in the UI copy (title: A-Z / Z-A, dates: oldest / newest
 * first, month: Jan-Dec / Dec-Jan). Rows with nothing to sort on (untitled for
 * `title`, no trip date for the trip keys) always go LAST, in both directions.
 */

export const MY_STORIES_SORT_KEYS = [
  "updated",
  "created",
  "title",
  "tripDate",
  "tripYear",
  "tripMonth",
] as const;
export type MyStoriesSortKey = (typeof MY_STORIES_SORT_KEYS)[number];

export type MyStoriesSortDirection = "asc" | "desc";

export type MyStoriesSort = {
  key: MyStoriesSortKey;
  direction: MyStoriesSortDirection;
};

/** "Last edited, newest first": the order the page has always had. */
export const DEFAULT_MY_STORIES_SORT: MyStoriesSort = {
  key: "updated",
  direction: "desc",
};

/**
 * The direction a key starts in when a contributor picks it: A-Z and Jan-Dec
 * read naturally ascending, every date key newest first. Switching key resets
 * to this instead of carrying the old direction over (which turned "Title"
 * into Z-A straight after the default "newest first").
 */
export const NATURAL_DIRECTION: Record<
  MyStoriesSortKey,
  MyStoriesSortDirection
> = {
  updated: "desc",
  created: "desc",
  title: "asc",
  tripDate: "desc",
  tripYear: "desc",
  tripMonth: "asc",
};

/** The sort a key starts with when chosen. */
export function sortForKey(key: MyStoriesSortKey): MyStoriesSort {
  return { key, direction: NATURAL_DIRECTION[key] };
}

/** The slice of a story the comparator reads. */
export type SortableStory = {
  title: string | null;
  trip_start_date: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export function serializeMyStoriesSort(sort: MyStoriesSort): string {
  return `${sort.key}:${sort.direction}`;
}

/** Validates a stored value; anything unrecognised falls back to the default. */
export function parseMyStoriesSort(
  value: string | null | undefined,
): MyStoriesSort {
  if (typeof value !== "string") return DEFAULT_MY_STORIES_SORT;
  const [key, direction, ...rest] = value.split(":");
  if (
    rest.length === 0 &&
    (MY_STORIES_SORT_KEYS as readonly string[]).includes(key) &&
    (direction === "asc" || direction === "desc")
  ) {
    return { key: key as MyStoriesSortKey, direction };
  }
  return DEFAULT_MY_STORIES_SORT;
}

/** Year and month (1-12) of a `date` column's "YYYY-MM-DD", or null. */
function parseTripDate(
  value: string | null,
): { year: number; month: number } | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

function timestamp(value: string | null): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Returns a copy of `stories` ordered by `sort`. `locale` drives the title
 * collation (Intl.Collator, so "Étienne" sits with E and zh-CN follows
 * pinyin). Ties keep their incoming order (Array.prototype.sort is stable),
 * except where a secondary key is specified below.
 */
export function sortMyStories<T extends SortableStory>(
  stories: readonly T[],
  sort: MyStoriesSort,
  locale: string,
): T[] {
  const collator = new Intl.Collator(locale, {
    numeric: true,
    sensitivity: "base",
  });
  const sign = sort.direction === "asc" ? 1 : -1;

  const hasTitle = (s: T) => !!s.title && s.title.trim() !== "";
  // Title ascending, untitled last; used as a secondary key, so it ignores
  // the chosen direction (a tie-break should not flip with it).
  const byTitle = (a: T, b: T) => {
    const aHas = hasTitle(a);
    const bHas = hasTitle(b);
    if (!aHas || !bHas) return aHas === bHas ? 0 : aHas ? -1 : 1;
    return collator.compare(a.title!.trim(), b.title!.trim());
  };

  // Compares two nullable numbers: null always last, otherwise `sign`-ordered.
  const byNumber = (a: number | null, b: number | null) => {
    if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
    return (a - b) * sign;
  };

  const trip = (s: T) => parseTripDate(s.trip_start_date);

  const comparators: Record<MyStoriesSortKey, (a: T, b: T) => number> = {
    updated: (a, b) =>
      byNumber(timestamp(a.updated_at), timestamp(b.updated_at)),
    created: (a, b) =>
      byNumber(timestamp(a.created_at), timestamp(b.created_at)),
    title: (a, b) => {
      const aHas = hasTitle(a);
      const bHas = hasTitle(b);
      if (!aHas || !bHas) return aHas === bHas ? 0 : aHas ? -1 : 1;
      return byTitle(a, b) * sign;
    },
    tripDate: (a, b) => {
      const ta = trip(a);
      const tb = trip(b);
      return byNumber(
        ta && ta.year * 12 + ta.month,
        tb && tb.year * 12 + tb.month,
      );
    },
    tripYear: (a, b) => {
      const ta = trip(a);
      const tb = trip(b);
      return byNumber(ta && ta.year, tb && tb.year) || byTitle(a, b);
    },
    tripMonth: (a, b) => {
      const ta = trip(a);
      const tb = trip(b);
      return (
        byNumber(ta && ta.month, tb && tb.month) ||
        byNumber(ta && ta.year, tb && tb.year) ||
        byTitle(a, b)
      );
    },
  };

  return [...stories].sort(comparators[sort.key]);
}
