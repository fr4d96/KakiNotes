import {
  COUNTRY_COOKIE,
  countryFromCookieValue,
  type CountrySlug,
} from "@/lib/story/countries";

/**
 * The country remembered on this device, read in the browser (client
 * components only). The cookie is written by POST /country, which reloads
 * into a new page, so nothing needs to be told when it changes.
 */
export function readRememberedCountry(): CountrySlug | null {
  const entry = document.cookie
    .split("; ")
    .find((part) => part.startsWith(`${COUNTRY_COOKIE}=`));
  return countryFromCookieValue(entry?.slice(COUNTRY_COOKIE.length + 1));
}

/** For useSyncExternalStore: the cookie changes only across a navigation. */
export function subscribeNoop() {
  return () => {};
}
