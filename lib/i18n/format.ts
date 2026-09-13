import { intlLocale, type Locale } from "@/i18n/locales";

/**
 * Locale-aware date and number formatting for reader- and contributor-facing
 * surfaces. Every helper takes the locale EXPLICITLY -- there is no ambient
 * "current locale" here -- so the same function is correct in a Server
 * Component (pass `await getLocale()`), a Client Component (`useLocale()`),
 * and a plain unit test. No `server-only`, no React, no next-intl import.
 *
 * English output is byte-identical to what the call sites produced before
 * this module existed (they all hard-coded "en-NZ"), which is what keeps the
 * ~400 English assertions in the unit suite green. Chinese reads the way a
 * Chinese reader expects a date to read: `2026年9月14日`, not `14 Sept 2026`
 * transliterated.
 *
 * Staff-page formatting (moderation, editorial, admin, readiness) still
 * calls Intl with "en-NZ" directly and is out of scope for phase 1.
 */

type DateInput = string | number | Date;

function toDate(value: DateInput): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "14 Sept 2026" / "2026年9月14日". Empty string for an unparseable input. */
export function formatDate(
  value: DateInput,
  locale: Locale,
  options: Intl.DateTimeFormatOptions = {},
): string {
  const date = toDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat(intlLocale(locale), {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...options,
  }).format(date);
}

/**
 * A `YYYY-MM-DD` calendar date (Engineering Rule 9: trip dates are dates,
 * not timestamps), formatted in UTC so it never shifts a day either side of
 * midnight in the viewer's zone. "1 Aug 2026" / "2026年8月1日".
 */
export function formatCalendarDate(value: DateInput, locale: Locale): string {
  return formatDate(value, locale, { timeZone: "UTC" });
}

/** "14 Sept 2026, 3:07 pm" / "2026年9月14日 15:07". */
export function formatDateTime(value: DateInput, locale: Locale): string {
  const date = toDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/** "1,234" in both locales (Chinese groups digits the same way). */
export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale(locale)).format(value);
}

/**
 * Cents -> "$1,234.50" (en-NZ) / "NZ$1,234.50" (zh-CN). The currency is
 * always New Zealand dollars; only the locale's way of writing it changes.
 * Cents in, because that is how story_revision_expenses stores money.
 */
export function formatCurrencyNzd(cents: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency: "NZD",
  }).format(cents / 100);
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * The four phrasings formatRelativeTime() needs, as a translator over the
 * `common.relativeTime` namespace (see messages/en.json). Typed structurally
 * rather than as next-intl's translator so this module stays free of that
 * import: a Server Component passes `await getTranslations("common.relativeTime")`,
 * a Client Component passes `useTranslations("common.relativeTime")`, and
 * a test can pass a plain function.
 */
export type RelativeTimeTranslator = (
  key: "justNow" | "minutesAgo" | "hoursAgo" | "daysAgo",
  values: { count: number },
) => string;

/**
 * "just now" / "14 min ago" / "3 hours ago" / "5 days ago" / "6 Aug" --
 * or "刚刚" / "14分钟前" / "3小时前" / "5天前" / "8月6日".
 *
 * The locale-aware sibling of lib/story/moderation-queue-view.ts's
 * relativeTime(), with the same thresholds and the same "anything older
 * than a week is a plain date" rule; the English output is identical. That
 * function stays as it is for the staff queue (out of scope), this one is
 * what the contributor-facing notifications page renders.
 *
 * `now` is injectable so tests are not clock-dependent, and so a Server
 * Component can pass the same instant to the client and avoid a hydration
 * mismatch on any request that crosses a minute boundary.
 */
export function formatRelativeTime(
  iso: string | null,
  locale: Locale,
  t: RelativeTimeTranslator,
  now: Date = new Date(),
): string | null {
  if (!iso) return null;
  const then = toDate(iso);
  if (!then) return null;

  const elapsed = now.getTime() - then.getTime();
  // Clock skew between the database and this process can make a
  // just-written row read as the future; "just now", not "in -0 minutes".
  if (elapsed < MINUTE) return t("justNow", { count: 0 });
  if (elapsed < HOUR) {
    return t("minutesAgo", { count: Math.floor(elapsed / MINUTE) });
  }
  if (elapsed < DAY) {
    return t("hoursAgo", { count: Math.floor(elapsed / HOUR) });
  }
  const days = Math.floor(elapsed / DAY);
  if (days <= 7) return t("daysAgo", { count: days });

  return formatDate(then, locale, {
    year: then.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}

/**
 * A country's name in the visitor's language: "Malaysia" / "马来西亚".
 *
 * English keeps lib/countries.ts's own curated list, byte for byte -- that
 * list is what the Account page's dropdown is built from, and its wording
 * ("South Korea", not "Korea, Republic of") is a deliberate product choice.
 * Other locales go through `Intl.DisplayNames`, which ships ~250 translated
 * country names with the runtime; adding 250 hand-written entries to
 * messages/zh-CN.json would be a large, drifting copy of data the platform
 * already has right.
 *
 * Falls back to the English name if the runtime has no translation, and
 * returns null for a missing or unknown code, exactly like countryName().
 */
export function formatCountryName(
  code: string | null | undefined,
  locale: Locale,
  englishName: string | null,
): string | null {
  if (!code || !englishName) return englishName;
  if (locale === "en") return englishName;
  try {
    return (
      new Intl.DisplayNames([intlLocale(locale)], {
        type: "region",
        // Without this, an unrecognised code comes back as the locale's
        // "Unknown Region" string (zh-CN: 未知地区) rather than as a miss,
        // and the English fallback below would never run.
        fallback: "none",
      }).of(code) ?? englishName
    );
  } catch {
    // A runtime without the region data for this locale, or a code that is
    // not a well-formed region subtag.
    return englishName;
  }
}
