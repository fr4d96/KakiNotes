import type { Locale } from "@/i18n/locales";

/**
 * Display-only Simplified Chinese for the CLOSED vocabulary tables --
 * `regions`, `destinations`, `work_types`, `expense_categories`. Their
 * `name` column is English and there is no `name_zh_cn` column yet; this
 * overlay keys off each row's SLUG (`vocab.regions.canterbury`) and falls
 * back to the database name whenever a translation is missing.
 *
 * Deliberately display-only, and deliberately no migration in phase 1:
 * adding a column would mean changing `list_published_stories()`, the most
 * performance-sensitive public query in the app, for a cosmetic gain. Once
 * vocabulary becomes editable in-app, `name_zh_cn` on those four tables is
 * the proper home and this overlay should be deleted -- see
 * docs/implementation-status.md (2026-09-14).
 *
 * WHERE IT CAN BE USED, and where it cannot. It needs a slug. The lookup
 * tables read directly (lib/story/active-lookups.ts, the public filter
 * readers) carry one, so the authoring pickers and the /stories filter bar
 * are covered. The PUBLIC RPCs do not: `list_published_stories()`,
 * `get_published_story()`, `get_published_story_expenses()` and
 * `get_expense_aggregates()` all build their JSON as `'region_name',
 * reg.name` -- a bare display string with no slug beside it (checked
 * against the migrations, not assumed). Those surfaces -- story cards, the
 * story page's place list, /costs' by-region and by-category rows -- stay
 * English in phase 1, and the `name_zh_cn` column is what fixes them.
 *
 * NEVER applied to `tags`, to `story_revision_locations.custom_destination_label`
 * or to an expense row's `custom_label`: those are user data (CLAUDE.md
 * product context), and translating what a contributor typed would be
 * putting words in their mouth.
 */

export type VocabKind =
  "regions" | "destinations" | "workTypes" | "expenseCategories";

/** Structural, so this module imports nothing from next-intl. */
export type VocabTranslator = {
  (key: never): string;
  has(key: never): boolean;
};

export type VocabRow = { slug?: string | null; name: string };

/**
 * The row's name in the visitor's language, or its database name when this
 * overlay has nothing for it (a region seeded after these messages were
 * written, a row with no slug in hand, or English itself).
 */
export function localizeVocabName(
  kind: VocabKind,
  row: VocabRow,
  t: VocabTranslator,
): string {
  if (!row.slug) return row.name;
  const key = `${kind}.${row.slug}` as never;
  return t.has(key) ? t(key) : row.name;
}

/**
 * True when this locale has any vocabulary overlay at all. Lets a caller
 * skip the per-row work (and the `vocab` translator) entirely for English,
 * where every lookup would return the database name anyway.
 */
export function hasVocabOverlay(locale: Locale): boolean {
  return locale !== "en";
}
