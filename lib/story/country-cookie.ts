import {
  COUNTRY_COOKIE,
  COUNTRY_COOKIE_MAX_AGE,
  countryFromCookieValue,
  countryUrlPrefix,
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

/**
 * Remember `country` on this device (same cookie POST /country writes) and
 * return the home URL to open. Used by the header switcher so the cookie is
 * in place before a hard navigation to that home -- see CountrySwitcher.
 */
export function rememberCountry(country: CountrySlug): string {
  document.cookie = `${COUNTRY_COOKIE}=${country}; path=/; max-age=${COUNTRY_COOKIE_MAX_AGE}; samesite=lax`;
  return countryUrlPrefix(country) || "/";
}

/** A full document load: drops the client router cache and every client
 * component's state, so nothing of the previous country can stay on screen. */
export function hardNavigate(url: string): void {
  window.location.assign(url);
}
