import "server-only";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_CURRENCY } from "@/lib/story/currency";

/**
 * The currency a country's stories record amounts in
 * (countries.currency_code, 20261121_currency_per_country). Selects `*` and
 * reads the column defensively, so this works before the migration reaches
 * the live project too -- then every country answers NZD, which is what the
 * database held. An unknown slug also answers NZD.
 */
export async function countryCurrency(countrySlug: string): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("countries")
    .select("*")
    .eq("slug", countrySlug)
    .maybeSingle();
  if (error) throw error;
  const code = (data as { currency_code?: unknown } | null)?.currency_code;
  return typeof code === "string" && /^[A-Z]{3}$/.test(code)
    ? code
    : DEFAULT_CURRENCY;
}

/**
 * The stories filter's cost bands are applied by list_published_stories() to
 * the raw amounts (under 5k ... 30k+, in whatever currency the story
 * records). They are offered only where they are labelled in that currency:
 * NZD ("Under NZ$5k") and, since 2026-11-26, MYR ("Under RM5k", the same
 * thresholds read in ringgit). A ¥5,000 trip is never called "under NZ$5k":
 * China keeps no bands.
 */
export const COST_BAND_CURRENCIES = ["NZD", "MYR"] as const;
export type CostBandCurrency = (typeof COST_BAND_CURRENCIES)[number];

export function costBandsOffered(
  currency: string,
): currency is CostBandCurrency {
  return (COST_BAND_CURRENCIES as readonly string[]).includes(currency);
}
