/**
 * One main story's costs added to its sub stories' costs, for the
 * "Total Trip Cost" view of the public cost breakdown
 * (components/story/public-expenses.tsx).
 *
 * PURE ARITHMETIC over rows the page already read through
 * get_published_story() -- the main story's own row and one row per sub
 * story that get_published_story_family() listed. Both readers only ever
 * return the approved, published revision (Engineering Rules 10-12), so
 * nothing here can pull a draft or pending figure into the total: there is
 * no query in this file to get wrong.
 *
 * CURRENCY. Amounts are never converted -- the single-story breakdown shows
 * a revision's figures in its own currency and nothing else, and this keeps
 * to that. A sub story recorded in a different currency from the main story
 * is left out of the sum and counted in `skippedOtherCurrency`, so the page
 * can say so instead of quietly adding yen to dollars.
 */

export type FamilyExpenseRow = {
  name: string;
  amount_nzd_cents: number;
  note: string | null;
};

export type FamilyExpenseStory = {
  title: string;
  slug: string;
  totalCents: number | null;
  tripStartDate: string | null;
  tripEndDate: string | null;
  expenses: FamilyExpenseRow[];
  currency: string;
};

export type PerStoryTotal = {
  title: string;
  slug: string;
  totalCents: number;
  /** The main story itself (shown unlinked: the reader is already on it). */
  isMain: boolean;
};

export type CombinedFamilyExpenses = {
  /** Sum of every included story's figure (see storyTotal()). */
  totalCents: number;
  /** Categories merged across stories, largest first. */
  expenses: FamilyExpenseRow[];
  /** Earliest start / latest end across the included stories. */
  tripStartDate: string | null;
  tripEndDate: string | null;
  /** Each included story's own figure, main story first. */
  perStory: PerStoryTotal[];
  /** Sub stories with costs left out because their currency differs. */
  skippedOtherCurrency: number;
};

/**
 * A story's figure: its stated total when it has one, otherwise what its
 * breakdown adds up to. null when it recorded no money at all.
 */
export function storyTotal(story: FamilyExpenseStory): number | null {
  if (story.totalCents != null) return story.totalCents;
  const positive = story.expenses.filter((e) => e.amount_nzd_cents > 0);
  if (positive.length === 0) return null;
  return positive.reduce((sum, e) => sum + e.amount_nzd_cents, 0);
}

/**
 * null when there is nothing to combine: no sub story recorded any money in
 * the main story's currency. The page uses that to hide the switch entirely.
 */
export function combineFamilyExpenses(
  main: FamilyExpenseStory,
  subStories: FamilyExpenseStory[],
): CombinedFamilyExpenses | null {
  const withMoney = subStories.filter((s) => storyTotal(s) != null);
  const included = withMoney.filter((s) => s.currency === main.currency);
  if (included.length === 0) return null;

  const stories = [main, ...included];
  const perStory = stories.flatMap((s, index): PerStoryTotal[] => {
    const totalCents = storyTotal(s);
    return totalCents == null
      ? []
      : [{ title: s.title, slug: s.slug, totalCents, isMain: index === 0 }];
  });

  // Merged by the label the reader sees (name, plus the note when there is
  // one), so "Rent" from three stories becomes one slice while a contributor's
  // own gloss ("Other — Van repairs") is never folded into someone else's.
  const merged = new Map<string, FamilyExpenseRow>();
  for (const story of stories) {
    for (const e of story.expenses) {
      if (e.amount_nzd_cents <= 0) continue;
      const key = `${e.name}\u0000${e.note ?? ""}`;
      const existing = merged.get(key);
      if (existing) existing.amount_nzd_cents += e.amount_nzd_cents;
      else merged.set(key, { ...e });
    }
  }

  // ISO dates compare correctly as strings.
  const starts = stories
    .map((s) => s.tripStartDate)
    .filter((d): d is string => d != null)
    .sort();
  const ends = stories
    .map((s) => s.tripEndDate)
    .filter((d): d is string => d != null)
    .sort();

  return {
    totalCents: perStory.reduce((sum, s) => sum + s.totalCents, 0),
    expenses: [...merged.values()].sort(
      (a, b) => b.amount_nzd_cents - a.amount_nzd_cents,
    ),
    tripStartDate: starts[0] ?? null,
    tripEndDate: ends[ends.length - 1] ?? null,
    perStory,
    skippedOtherCurrency: withMoney.length - included.length,
  };
}
