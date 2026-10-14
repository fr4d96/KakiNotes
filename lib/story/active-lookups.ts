import "server-only";
import { createClient } from "@/lib/supabase/server";
import { vocabName } from "@/lib/i18n/vocab";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/locales";

// Regions/destinations/tags all carry an `active` boolean
// (supabase/migrations/... regions/destinations/tags tables) so an entry can
// be retired from new authoring without breaking already-published stories
// that reference it. These are anonymous-readable lookup tables (no RLS
// restriction beyond `active`), used only to populate authoring-form pickers
// — never joined with any draft/pending content.
//
// There is deliberately no work_types reader here: tags are the platform's
// only taxonomy as of 2026-08-16, and every non-fixture work_types row is
// now `active = false` (see
// supabase/migrations/20260816100100_curate_whv_tags_retire_work_types.sql).
// The table itself is retained because published revisions still reference
// it.

export type ActiveRegion = {
  id: string;
  name: string;
  slug: string;
  islandOrGrouping: string | null;
  name_zh_cn: string | null;
  /**
   * The slug of the country this region belongs to (regions.country_id ->
   * countries.slug). Always present -- regions.country_id is NOT NULL --
   * so a client that fetches every active region (no countrySlug filter)
   * can still filter/group by country itself, e.g. the Places step's
   * client-side region filter and the moderation queue's region-by-country
   * optgroup.
   */
  countrySlug: string;
};

export type ActiveCountry = {
  id: string;
  slug: string;
  code: string;
  name: string;
  name_zh_cn: string | null;
};

export type ActiveDestination = {
  id: string;
  name: string;
  slug: string;
  regionId: string;
  name_zh_cn: string | null;
};

export type ActiveTag = {
  id: string;
  name: string;
  slug: string;
};

/**
 * Resolves a country slug to id. `countries` is the same lookup-table
 * access shape as regions/destinations/tags (anon- and authenticated-
 * readable where `active = true`), so this is a plain typed table read, not
 * an RPC. Returns null for an unknown/inactive slug rather than throwing --
 * callers treat that as "scope to nothing", not a hard error.
 */
export async function resolveCountryId(
  countrySlug: string,
): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("countries")
    .select("id")
    .eq("slug", countrySlug)
    .eq("active", true)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

/**
 * `countrySlug` scopes the picker to one country's regions (product
 * decision 4: "the region picker only shows that country's regions").
 * Resolves the slug to `regions.country_id` first rather than an embedded
 * join, so this keeps working against a hand-edited types/database.ts that
 * may not yet describe the `regions -> countries` relationship. Omitted
 * entirely => every active region across every country, which is still
 * correct for any reader that doesn't (yet) know which country it's scoped
 * to. An unknown/inactive country slug returns an empty list, never "every
 * region" -- the picker must not silently widen on a bad slug.
 */
export async function listActiveRegions(
  countrySlug?: string,
): Promise<ActiveRegion[]> {
  const supabase = await createClient();
  let countryId: string | null = null;
  if (countrySlug) {
    countryId = await resolveCountryId(countrySlug);
    if (!countryId) return [];
  }
  let query = supabase
    .from("regions")
    .select("id, name, slug, island_or_grouping, name_zh_cn, country_id")
    .eq("active", true);
  if (countryId) {
    query = query.eq("country_id", countryId);
  }
  const { data, error } = await query.order("name");
  if (error) throw error;
  const rows = data ?? [];
  if (rows.length === 0) return [];

  // Two plain queries rather than an embedded `countries(slug)` select --
  // same reasoning as resolveCountryId's own comment: this keeps working
  // against a hand-edited types/database.ts that may not yet describe the
  // regions -> countries relationship.
  const countryIds = [...new Set(rows.map((r) => r.country_id))];
  const { data: countryRows, error: countryError } = await supabase
    .from("countries")
    .select("id, slug")
    .in("id", countryIds);
  if (countryError) throw countryError;
  const countrySlugById = new Map(
    (countryRows ?? []).map((c) => [c.id, c.slug] as const),
  );

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    islandOrGrouping: r.island_or_grouping,
    name_zh_cn: r.name_zh_cn,
    countrySlug: countrySlugById.get(r.country_id) ?? "",
  }));
}

/**
 * Active countries for the Places step's Country select. Mirrors the
 * `active` retirement model every other lookup here uses (the select would
 * otherwise offer a country no longer open to new authoring).
 */
export async function listActiveCountries(): Promise<ActiveCountry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("countries")
    .select("id, slug, code, name, name_zh_cn")
    .eq("active", true)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

/**
 * `regionIds` scopes destinations to the regions already returned by a
 * country-scoped `listActiveRegions()` call -- destinations have no direct
 * `country_id` of their own (they inherit it through `region_id`), so this
 * avoids a second countries join and keeps destinations and regions from
 * ever disagreeing about which country they belong to.
 */
export async function listActiveDestinations(
  regionIds?: readonly string[],
): Promise<ActiveDestination[]> {
  const supabase = await createClient();
  let query = supabase
    .from("destinations")
    .select("id, name, slug, region_id, name_zh_cn")
    .eq("active", true);
  if (regionIds) {
    query = query.in("region_id", [...regionIds]);
  }
  const { data, error } = await query.order("name");
  if (error) throw error;
  return (data ?? []).map((d) => ({
    id: d.id,
    name: d.name,
    slug: d.slug,
    regionId: d.region_id,
    name_zh_cn: d.name_zh_cn,
  }));
}

/**
 * A curated expense category for the optional per-category breakdown
 * (2026-09-02). Same `active` retirement model as regions/destinations/
 * tags. Unlike tags there is NO contributor-authored escape hatch: an
 * expense exists to be aggregated across stories, and free text makes that
 * impossible -- the `other` category plus a per-row note carries the long
 * tail. See supabase/migrations/20260902110000_expense_categories.sql.
 */
export type ActiveExpenseCategory = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  name_zh_cn: string | null;
};

/**
 * Ordered by the table's own `sort_order`, not alphabetically: the editor
 * lists these in trip order (flights, visa, insurance, then on-the-ground
 * costs), with "Other" deliberately last. Name breaks ties.
 */
export async function listActiveExpenseCategories(): Promise<
  ActiveExpenseCategory[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("expense_categories")
    .select("id, name, slug, description, name_zh_cn")
    .eq("active", true)
    .order("sort_order")
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function listActiveTags(): Promise<ActiveTag[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tags")
    .select("id, name, slug")
    .eq("active", true)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

/**
 * Resolves a revision's stored location rows into display labels, in the
 * order the contributor arranged them.
 *
 * DELIBERATELY DOES NOT FILTER ON `active`, unlike every reader above. Those
 * populate authoring pickers, where a retired entry must not be offered. This
 * one describes what a story ALREADY references, and a region retired after
 * publication is still where that person actually went — filtering it would
 * silently drop a place from their own export. Same reasoning as
 * get_revision_selections() resolving retired tag names server-side
 * (20260816100200_get_revision_selections_tag_names.sql).
 *
 * Label shape matches the public story page's `regionLabels()`:
 * "Destination, Region", or the bare region when there is no destination.
 */
export async function resolveLocationLabels(
  locations: readonly {
    regionId: string;
    destinationId: string | null;
    customDestinationLabel: string | null;
    sortOrder: number;
  }[],
  locale: Locale = DEFAULT_LOCALE,
): Promise<string[]> {
  if (locations.length === 0) return [];
  const supabase = await createClient();

  const regionIds = [...new Set(locations.map((l) => l.regionId))];
  const destinationIds = [
    ...new Set(
      locations
        .map((l) => l.destinationId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const [regions, destinations] = await Promise.all([
    supabase.from("regions").select("id, name, name_zh_cn").in("id", regionIds),
    destinationIds.length
      ? supabase
          .from("destinations")
          .select("id, name, name_zh_cn")
          .in("id", destinationIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (regions.error) throw regions.error;
  if (destinations.error) throw destinations.error;

  // The curated rows carry their Simplified Chinese twin (20260914092322),
  // so a contributor reading in Chinese gets Chinese place names in their
  // PDF. A contributor-TYPED destination label is passed through untouched
  // below -- it is their own words, never translated.
  const regionName = new Map(
    (regions.data ?? []).map((r) => [r.id, vocabName(r, locale)] as const),
  );
  const destinationName = new Map(
    (destinations.data ?? []).map((d) => [d.id, vocabName(d, locale)] as const),
  );

  return [...locations]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((location) => {
      const region = regionName.get(location.regionId) ?? null;
      const destination = location.destinationId
        ? (destinationName.get(location.destinationId) ?? null)
        : location.customDestinationLabel;
      if (destination && region) return `${destination}, ${region}`;
      return destination ?? region;
    })
    .filter((label): label is string => Boolean(label));
}
