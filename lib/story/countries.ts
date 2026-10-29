// Shared country configuration (China, 2026-10-14). Deliberately NOT a
// database read on every import -- the two countries that exist today are
// infra constants (route prefix, which copy namespace to read), not UI
// copy. The actual region/destination/story data is 100% DB-driven
// (supabase/migrations/20261014085842_countries.sql); only the "which
// countries does this app have routes/copy for" list lives here, same way
// i18n/locales.ts is a dependency-free constant both server and client code
// import. Nationality/destination/work classification stay data, not
// hard-coded UI strings -- this module never contains display copy, only
// slugs and routing shape.

export const COUNTRY_SLUGS = ["new-zealand", "china"] as const;

export type CountrySlug = (typeof COUNTRY_SLUGS)[number];

export const DEFAULT_COUNTRY_SLUG: CountrySlug = "new-zealand";

export function isCountrySlug(value: string): value is CountrySlug {
  return (COUNTRY_SLUGS as readonly string[]).includes(value);
}

/**
 * NZ keeps its existing, unprefixed URLs (product decision: "NZ URLs stay
 * unchanged"). China lives under /cn. Every public route builder in app/
 * goes through this so the prefix is never typed twice.
 */
export function countryUrlPrefix(country: CountrySlug): string {
  return country === "china" ? "/cn" : "";
}

/**
 * Which country section a public URL belongs to. Used by the shared
 * header/footer, which live in the one (public) layout and so can't be told
 * the country by a page.
 */
export function countryFromPathname(pathname: string | null): CountrySlug {
  return pathname === "/cn" || pathname?.startsWith("/cn/")
    ? "china"
    : "new-zealand";
}

/**
 * The i18n message namespace segment for this country's copy variants
 * (messages/<locale>.json's `countryContent.<segment>` object) -- see
 * countryContent.newZealand / countryContent.china in i18n/messages/en.json
 * and zh-CN.json for the keys every country must carry (siteDescription,
 * tagline, storiesIntro, storiesMetaDescription, costsFraming, aboutText,
 * personalExperienceLabel, locationNoMatch, name).
 */
export function countryMessageSegment(
  country: CountrySlug,
): "newZealand" | "china" {
  return country === "china" ? "china" : "newZealand";
}
