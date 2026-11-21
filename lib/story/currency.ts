/**
 * The currency of a story revision's amounts, from a row returned by
 * get_my_story_with_draft / get_story_preview / get_published_story
 * (20261121_currency_per_country appends `currency`).
 *
 * Read defensively on purpose: this app code ships BEFORE the migration
 * reaches the live project (docs/currency-per-country-plan.md, rollout), so
 * until then the column is absent and every amount is NZD -- which is
 * exactly what the database held before it. Anything that isn't a
 * three-letter code falls back the same way.
 */
export const DEFAULT_CURRENCY = "NZD";

export function revisionCurrency(row: unknown): string {
  if (row && typeof row === "object" && "currency" in row) {
    const value = (row as { currency?: unknown }).currency;
    if (typeof value === "string" && /^[A-Z]{3}$/.test(value)) return value;
  }
  return DEFAULT_CURRENCY;
}
