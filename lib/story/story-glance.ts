import { intlLocale, type Locale } from "@/i18n/locales";

/**
 * The small facts in a story page's "at a glance" row
 * (components/story/story-glance.tsx): how long the trip was, when, and
 * roughly how long the story takes to read. Pure arithmetic, no React, so
 * the server renders it and the unit suite tests it directly.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function parseCalendarDate(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Days on the trip, counting both ends (2 Nov to 5 Nov is 4 days, the way a
 * traveller says "4D3N"). null without a valid, ordered range.
 */
export function tripDays(
  startDate: string | null,
  endDate: string | null,
): number | null {
  const start = parseCalendarDate(startDate);
  const end = parseCalendarDate(endDate);
  if (!start || !end || end < start) return null;
  return Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;
}

/**
 * "2–5 Nov 2026" / "2026年11月2日至5日": the locale's own range format, in
 * UTC so a calendar date never slips a day (Engineering Rule 9). null
 * without a valid range.
 */
export function formatTripRange(
  startDate: string | null,
  endDate: string | null,
  locale: Locale,
): string | null {
  const start = parseCalendarDate(startDate);
  const end = parseCalendarDate(endDate);
  if (!start || !end || end < start) return null;
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).formatRange(start, end);
}

// Han, Hiragana, Katakana, Hangul: read per character, not per word.
const CJK = /[぀-ヿ㐀-䶿一-鿿가-힯]/g;

/**
 * Whole minutes to read a story's Markdown: about 220 words a minute, and
 * about 400 characters a minute for Chinese, which has no spaces to count.
 * Markdown punctuation and link targets are dropped first. Never below 1.
 */
export function readingMinutes(markdown: string): number {
  const text = markdown
    .replace(/\]\([^)]*\)/g, "]") // link targets are not read
    .replace(/[#>*_`~[\]|-]/g, " ");
  const cjkChars = (text.match(CJK) ?? []).length;
  const words = text
    .replace(CJK, " ")
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  const minutes = words / 220 + cjkChars / 400;
  return Math.max(1, Math.round(minutes));
}
