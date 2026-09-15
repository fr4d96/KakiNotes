import en from "@/i18n/messages/en.json";
import zhCN from "@/i18n/messages/zh-CN.json";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/locales";

/**
 * The locale the next-intl mocks in vitest.setup.ts resolve against.
 *
 * Default English, so the ~400 existing English assertions across the unit
 * suite keep passing with no per-test provider. A test that wants to prove a
 * component really renders Chinese calls `setTestLocale("zh-CN")` (and
 * resets in afterEach), or wraps the render in `withTestLocale` -- the mocks
 * read this variable on every call, so there is no re-mocking ceremony.
 *
 * Deliberately imports nothing from next-intl: vitest.setup.ts's mock
 * factories import THIS module while building the mock, so an import of
 * next-intl from here would be circular.
 */
let testLocale: Locale = DEFAULT_LOCALE;

export const TEST_MESSAGES = { en, "zh-CN": zhCN } as const;

export const TEST_TIME_ZONE = "Pacific/Auckland";

export function getTestLocale(): Locale {
  return testLocale;
}

export function setTestLocale(locale: Locale) {
  testLocale = locale;
}

export async function withTestLocale<T>(
  locale: Locale,
  run: () => T | Promise<T>,
): Promise<T> {
  const previous = testLocale;
  testLocale = locale;
  try {
    return await run();
  } finally {
    testLocale = previous;
  }
}
