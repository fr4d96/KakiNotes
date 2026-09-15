import { prefixedVocabName } from "@/lib/i18n/vocab";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/locales";

/**
 * Region entries as the public RPCs emit them. Since 20260914150000 each
 * carries the Simplified Chinese twin beside the English name; a
 * contributor-typed destination label arrives with a null twin and renders
 * as typed (see lib/i18n/vocab.ts).
 */
type RegionEntry = {
  region_name?: string;
  region_name_zh_cn?: string | null;
  destination_name?: string | null;
  destination_name_zh_cn?: string | null;
};

/**
 * Every helper here takes the locale explicitly and defaults to English --
 * the rule lib/i18n/format.ts set in phase 1. It keeps these functions
 * usable from a Server Component, a Client Component and a plain test
 * alike, and it means the ~400 existing English assertions keep passing
 * without being touched.
 */

export function firstRegionLabel(
  regions: unknown,
  locale: Locale = DEFAULT_LOCALE,
): string | null {
  if (!Array.isArray(regions) || regions.length === 0) return null;
  const first = regions[0] as RegionEntry;
  const region = prefixedVocabName(first, "region", locale);
  if (!region) return null;
  const destination = prefixedVocabName(first, "destination", locale);
  return destination ? `${destination}, ${region}` : region;
}

export function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

/** Every region name a story is tagged with (not just the first). */
export function regionNames(
  regions: unknown,
  locale: Locale = DEFAULT_LOCALE,
): string[] {
  if (!Array.isArray(regions)) return [];
  return regions
    .map((entry) => prefixedVocabName(entry, "region", locale))
    .filter((name): name is string => name !== null);
}

/**
 * Every destination (town/area) name a story is tagged with. A location row
 * that names only a region and no destination contributes nothing here.
 */
export function destinationNames(
  regions: unknown,
  locale: Locale = DEFAULT_LOCALE,
): string[] {
  if (!Array.isArray(regions)) return [];
  return regions
    .map((entry) => prefixedVocabName(entry, "destination", locale))
    .filter((name): name is string => name !== null);
}
