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
 * The stories filter's cost bands (under NZ$5k ... NZ$30k+, applied by
 * list_published_stories() to the raw amounts) only mean something in New
 * Zealand dollars: a ¥5,000 trip is not "under NZ$5k". So they are offered
 * only where the country records NZD.
 */
export function costBandsOffered(currency: string): boolean {
  return currency === "NZD";
}
