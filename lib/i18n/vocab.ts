import type { Locale } from "@/i18n/locales";

/**
 * Simplified Chinese for the CLOSED vocabulary tables -- `regions`,
 * `destinations`, `expense_categories` -- picked from the row itself.
 *
 * Phase 1 (2026-09-14) keyed this off each row's SLUG against a map in
 * messages/zh-CN.json, which only worked where a slug was in hand: the
 * /stories filters and the authoring pickers, both of which read the tables
 * directly. The public RPCs emitted `'region_name', reg.name` -- a bare
 * display string -- so story cards, the story page's place list, the
 * contributor byline's regions row and /costs stayed English. Migration
 * 20260914150000 put `name_zh_cn` on the tables and surfaced it through
 * every public RPC beside its English twin, and 20260914150100 did the same
 * for the contributor facts, so the translation now travels WITH the name
 * and that slug overlay is gone.
 *
 * The row carries both languages and the caller picks. The RPCs take no
 * locale parameter on purpose: their output is identical whichever language
 * the visitor reads, which is what lets lib/story/public-queries.ts keep
 * caching results under a key with no locale in it (see the 2026-09-14 ISR
 * trade). A cache key per language would double the entries and halve the
 * hit rate for a difference of one string per row.
 *
 * NULL means "show the English name", never "translate it here": a row
 * seeded after the backfill, or -- the case that matters -- a
 * CONTRIBUTOR-TYPED label. `destination_name` is
 * `coalesce(dest.name, loc.custom_destination_label)` and an expense's
 * `name` is `coalesce(ec.name, e.custom_label)`, while the `_zh_cn` twin
 * reads only the curated table, so a typed label always arrives with null
 * beside it and renders exactly as its author typed it. Translating what a
 * contributor wrote would be putting words in their mouth (CLAUDE.md
 * product context). The same goes for `tags`, which carry no translation at
 * all.
 *
 * `work_types` is absent deliberately: retired as a taxonomy on 2026-08-16
 * (20260816100100) and shown nowhere.
 */

/** Any curated vocabulary row read straight off its table. */
export type LocalizedVocabRow = {
  name: string;
  name_zh_cn?: string | null;
};

/**
 * The row's name in the visitor's language, falling back to the English
 * `name` whenever there is no translation. Never returns an empty string
 * for a row that has a name.
 */
export function vocabName(
  row: LocalizedVocabRow | null | undefined,
  locale: Locale,
): string {
  if (!row) return "";
  if (locale === "zh-CN") {
    const zh = row.name_zh_cn?.trim();
    if (zh) return zh;
  }
  return row.name;
}

/**
 * The same pick for a payload that carries its two names under PREFIXED
 * keys rather than `name`/`name_zh_cn` -- how the RPCs shape their region
 * entries (`region_name` + `region_name_zh_cn`, `destination_name` +
 * `destination_name_zh_cn`). Returns null when the English key is missing
 * or is not a string, so a malformed row renders nothing rather than
 * "undefined".
 */
export function prefixedVocabName(
  entry: unknown,
  prefix: string,
  locale: Locale,
): string | null {
  if (!entry || typeof entry !== "object") return null;
  const row = entry as Record<string, unknown>;
  const english = row[`${prefix}_name`];
  if (typeof english !== "string" || english.length === 0) return null;
  if (locale === "zh-CN") {
    const zh = row[`${prefix}_name_zh_cn`];
    if (typeof zh === "string" && zh.trim().length > 0) return zh.trim();
  }
  return english;
}

/**
 * Sorts curated vocabulary rows by the name the visitor actually sees.
 *
 * The readers order by the English `name` in SQL, which puts a Chinese list
 * in an order with no relationship to anything on screen -- 奥克兰 sorting
 * under "A" tells a Chinese reader nothing. Intl.Collator with the pinyin
 * collation is the equivalent of A-Z for Simplified Chinese, and is what
 * the Account country dropdown already uses (lib/i18n/format.ts). English
 * keeps the database order untouched: re-sorting it client-side would
 * change nothing but could reorder ties differently from Postgres.
 *
 * Returns a NEW array; the input is not mutated.
 */
export function sortByLocalizedName<T extends LocalizedVocabRow>(
  rows: readonly T[],
  locale: Locale,
): T[] {
  if (locale !== "zh-CN") return [...rows];
  const collator = new Intl.Collator("zh-CN", {
    collation: "pinyin",
    sensitivity: "base",
  });
  return [...rows].sort((a, b) =>
    collator.compare(vocabName(a, locale), vocabName(b, locale)),
  );
}
