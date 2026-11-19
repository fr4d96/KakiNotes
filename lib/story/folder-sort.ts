/**
 * Order for the story folders picker's sub story list
 * (app/(contributor)/my-stories/map/story-folders-view.tsx): last updated
 * first, ties broken by title (A-Z, untitled last). Stories with no known
 * update time go last. Pure: returns a new array, never mutates the input.
 */
export type FolderSortable = {
  title: string | null;
  updatedAt?: string | null;
};

function timestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

export function sortByLastUpdated<T extends FolderSortable>(
  stories: readonly T[],
  locale: string,
): T[] {
  const collator = new Intl.Collator(locale, {
    numeric: true,
    sensitivity: "base",
  });
  const titleOf = (s: T) => s.title?.trim() ?? "";
  return [...stories].sort((a, b) => {
    const ta = timestamp(a.updatedAt);
    const tb = timestamp(b.updatedAt);
    if (ta !== tb) {
      if (ta === null) return 1;
      if (tb === null) return -1;
      return tb - ta;
    }
    const aTitle = titleOf(a);
    const bTitle = titleOf(b);
    if (!aTitle || !bTitle) return aTitle === bTitle ? 0 : aTitle ? -1 : 1;
    return collator.compare(aTitle, bTitle);
  });
}
