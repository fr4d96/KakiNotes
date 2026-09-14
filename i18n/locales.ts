/**
 * The locales the app can render, and how they map onto the browser's
 * `Intl` conventions.
 *
 * Deliberately a tiny, dependency-free module: it is imported by the
 * server-side request config (i18n/request.ts), by the Server Action that
 * writes the cookie, by Client Components (the toggle) and by the formatting
 * helpers in lib/i18n/format.ts -- so it must be safe in every runtime and
 * carry no `server-only` marker.
 *
 * The locale lives in a COOKIE, not in the URL. Story content, contributor
 * bios, tags and place names are user data and are never translated, so a
 * `/zh/` prefix would only ever give search engines a second URL for the
 * same story with the same body -- see docs/implementation-status.md
 * (2026-09-14) for the full decision. English stays the default: no cookie,
 * or a cookie holding anything outside LOCALES, renders English.
 */
export const LOCALES = ["en", "zh-CN"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/**
 * next-intl's own default cookie name, kept on purpose so any future move
 * to its middleware-driven mode reads the same cookie visitors already have.
 */
export const LOCALE_COOKIE = "NEXT_LOCALE";

/** One year, in seconds -- a language choice is not a session. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === "string" && (LOCALES as readonly string[]).includes(value)
  );
}

/**
 * The `Intl` locale tag to format dates and numbers with. The app's English
 * has always used New Zealand conventions (`en-NZ`: day-month-year, NZ$),
 * and "en" alone would silently switch that to US month-day-year -- so the
 * two are mapped explicitly rather than passing the app locale straight
 * through.
 */
export function intlLocale(locale: Locale): string {
  return locale === "zh-CN" ? "zh-CN" : "en-NZ";
}

/** The label the toggle shows: what you will switch TO, not what is active. */
export function otherLocale(locale: Locale): Locale {
  return locale === "en" ? "zh-CN" : "en";
}
