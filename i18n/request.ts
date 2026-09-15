import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale } from "./locales";

/**
 * next-intl's per-request configuration, in its "without i18n routing"
 * mode (no `[locale]` segment, no middleware): the locale is read from the
 * cookie components/locale-toggle.tsx sets through
 * lib/i18n/set-locale-action.ts.
 *
 * The cookie is user-controlled input and is validated against LOCALES
 * before it chooses a messages file -- a missing, empty or garbage value
 * falls back to English rather than throwing or reaching for a file by
 * name. (Engineering Rule 2 is about mutations, but the same "never trust
 * the client" habit applies to anything that picks a file path.)
 *
 * Reading cookies() here is what makes every route dynamic; the public
 * pages compensate by caching their DATA instead (lib/story/public-queries.ts).
 */
export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const requested = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(requested) ? requested : DEFAULT_LOCALE;

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
    // The app's dates are New Zealand calendar dates. Pinning the time zone
    // keeps next-intl's own formatters (useFormatter/getFormatter) from
    // warning about an environment fallback and from disagreeing between
    // server and client when a visitor is in another zone.
    timeZone: "Pacific/Auckland",
  };
});
