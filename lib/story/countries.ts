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

/**
 * Each country's flag, as an emoji (owner decision 2026-11-16: native and
 * crisp on iPhone/Mac; Windows shows the two letters instead). A symbol for
 * the country, not display copy -- the name always comes from
 * countryContent.<segment>.name beside it.
 */
export const COUNTRY_FLAGS: Record<CountrySlug, string> = {
  "new-zealand": "🇳🇿",
  china: "🇨🇳",
};

/**
 * The reader's chosen country, remembered on this device (owner decision
 * 2026-11-16: per device, like the language cookie, not on the account).
 * Not httpOnly: the tab bar and header read it in the browser to know which
 * country's Home/Stories to link to on pages that aren't in either country
 * (My Stories, the editor, Account). It only picks a starting point and
 * links -- never access or what a query may return.
 */
export const COUNTRY_COOKIE = "kakinotes-country";
/**
 * The country a new story belongs to: the link's own `?country=` when it
 * names a real one, otherwise the country picked in the header (remembered
 * in COUNTRY_COOKIE), otherwise undefined (the server's default). The
 * editor has no country picker of its own since 2026-11-18 -- the header's
 * flag is the one place a contributor chooses it.
 */
export function newStoryCountry(
  param: string | undefined,
  cookieValue: string | undefined,
): CountrySlug | undefined {
  if (param && isCountrySlug(param)) return param;
  return countryFromCookieValue(cookieValue) ?? undefined;
}

export const COUNTRY_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** A cookie value -> a country, or null when missing or not one we have. */
export function countryFromCookieValue(
  value: string | null | undefined,
): CountrySlug | null {
  return value && isCountrySlug(value) ? value : null;
}

/** The public pages that belong to a country (NZ unprefixed, China /cn). */
const COUNTRY_PAGE_ROOTS = ["/stories", "/contributors", "/costs", "/about"];

/**
 * Which country the header and tab bar should show. A country's own public
 * page says so by its URL; anywhere else (My Stories, the editor, Account,
 * sign-in) uses the remembered choice, falling back to New Zealand. The
 * author's own screens under /stories (new, <id>/edit, <id>/preview) are
 * not reader pages, so they follow the remembered choice too.
 */
export function countryForPath(
  pathname: string | null,
  remembered: CountrySlug | null,
): CountrySlug {
  if (pathname === "/cn" || pathname?.startsWith("/cn/")) return "china";
  const path = pathname ?? "";
  const isAuthorScreen =
    path === "/stories/new" ||
    path.startsWith("/stories/new/") ||
    /^\/stories\/[^/]+\/(edit|preview)(\/|$)/.test(path);
  const isCountryPage =
    path === "/" ||
    (!isAuthorScreen &&
      COUNTRY_PAGE_ROOTS.some(
        (root) => path === root || path.startsWith(`${root}/`),
      ));
  return isCountryPage ? "new-zealand" : (remembered ?? DEFAULT_COUNTRY_SLUG);
}
