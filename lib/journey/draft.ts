/**
 * Pure helpers for the contributor's stop list, which is a ONE-LEVEL
 * hierarchy: MAIN stops (no parent) and SUB-STOPS that sit inside exactly one
 * main stop. Drafts reference their parent by the client-only React `key`
 * (stable under reordering); positions are only worked out when saving, by
 * toParentIndexes(). The database re-validates everything.
 *
 * "Normalised" order = every main stop immediately followed by its own
 * sub-stops, which is also the order the stops are saved and read back in.
 */

export type HierarchicalStop = {
  key: string;
  /** Key of the main stop this sits inside; null/undefined = a main stop. */
  parentKey?: string | null;
};

/**
 * Mains in their given order, each followed by its sub-stops (in their given
 * order). A sub-stop whose parent is missing, or is itself a sub-stop, is
 * dropped. Returns new objects only where `parentKey` had to be defaulted.
 */
export function normalizeStops<T extends HierarchicalStop>(
  stops: readonly T[],
): T[] {
  const mains = stops.filter((s) => (s.parentKey ?? null) === null);
  const out: T[] = [];
  for (const main of mains) {
    out.push(main);
    for (const s of stops) {
      if (s.parentKey === main.key) out.push(s);
    }
  }
  return out;
}

/** Labels like "1", "2", "2a", "2b" for a NORMALISED list. */
export function stopIds(stops: readonly HierarchicalStop[]): string[] {
  const ids: string[] = [];
  let mainNumber = 0;
  let letter = 0;
  for (const s of stops) {
    if ((s.parentKey ?? null) === null) {
      mainNumber += 1;
      letter = 0;
      ids.push(String(mainNumber));
    } else {
      ids.push(`${mainNumber}${String.fromCharCode(97 + letter)}`);
      letter += 1;
    }
  }
  return ids;
}

export function countMains(stops: readonly HierarchicalStop[]): number {
  return stops.filter((s) => (s.parentKey ?? null) === null).length;
}

export function subsOf<T extends HierarchicalStop>(
  stops: readonly T[],
  mainKey: string,
): T[] {
  return stops.filter((s) => s.parentKey === mainKey);
}

/**
 * For a NORMALISED list: the array position of each stop's parent (null for
 * a main stop) -- what set_revision_stops() takes as `parent_index`.
 */
export function toParentIndexes(
  stops: readonly HierarchicalStop[],
): Array<number | null> {
  const indexByKey = new Map(stops.map((s, i) => [s.key, i]));
  return stops.map((s) =>
    s.parentKey == null ? null : (indexByKey.get(s.parentKey) ?? null),
  );
}

/**
 * Remove a stop; removing a MAIN stop removes the sub-stops inside it too.
 * Returns the new list and how many stops went in total.
 */
export function removeWithChildren<T extends HierarchicalStop>(
  stops: readonly T[],
  key: string,
): { next: T[]; removed: T[] } {
  const removed = stops.filter((s) => s.key === key || s.parentKey === key);
  const gone = new Set(removed.map((s) => s.key));
  return { next: stops.filter((s) => !gone.has(s.key)), removed };
}

/**
 * Move a stop one place among its SIBLINGS: a main stop swaps places (with
 * its sub-stops) with the neighbouring main stop; a sub-stop swaps with the
 * neighbouring sub-stop of the same main stop. Null at either end.
 */
export function moveAmongSiblings<T extends HierarchicalStop>(
  stops: readonly T[],
  key: string,
  delta: -1 | 1,
): T[] | null {
  const me = stops.find((s) => s.key === key);
  if (!me) return null;
  const parent = me.parentKey ?? null;
  const siblings = stops.filter((s) => (s.parentKey ?? null) === parent);
  const at = siblings.findIndex((s) => s.key === key);
  const other = siblings[at + delta];
  if (!other) return null;
  const order = siblings.slice();
  [order[at], order[at + delta]] = [order[at + delta], order[at]];
  if (parent !== null) {
    // Reorder sub-stops inside the one main stop, then re-group.
    const subs = new Set(order.map((s) => s.key));
    const rest = stops.filter((s) => !subs.has(s.key));
    return normalizeStops([...rest, ...order]);
  }
  return normalizeStops([
    ...order,
    ...stops.filter((s) => s.parentKey != null),
  ]);
}

/** Whether `key` can move up (-1) or down (+1) among its siblings. */
export function canMove(
  stops: readonly HierarchicalStop[],
  key: string,
  delta: -1 | 1,
): boolean {
  return moveAmongSiblings(stops, key, delta) !== null;
}
