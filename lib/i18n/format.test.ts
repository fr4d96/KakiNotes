import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import en from "@/i18n/messages/en.json";
import zhCN from "@/i18n/messages/zh-CN.json";
import {
  formatCalendarDate,
  formatCurrencyNzd,
  formatDate,
  formatDateTime,
  formatCountryName,
  formatNumber,
  formatRelativeTime,
  type RelativeTimeTranslator,
} from "@/lib/i18n/format";
import { intlLocale } from "@/i18n/locales";

const relativeEn = createTranslator({
  locale: "en",
  messages: en,
  namespace: "common.relativeTime",
}) as unknown as RelativeTimeTranslator;
const relativeZh = createTranslator({
  locale: "zh-CN",
  messages: zhCN,
  namespace: "common.relativeTime",
}) as unknown as RelativeTimeTranslator;

describe("intlLocale", () => {
  it("keeps New Zealand conventions for English and maps Chinese straight through", () => {
    expect(intlLocale("en")).toBe("en-NZ");
    expect(intlLocale("zh-CN")).toBe("zh-CN");
  });
});

describe("formatDate", () => {
  it("matches the app's previous en-NZ output exactly", () => {
    const expected = new Date("2026-09-14T03:00:00.000Z").toLocaleDateString(
      "en-NZ",
      { year: "numeric", month: "short", day: "numeric" },
    );
    expect(formatDate("2026-09-14T03:00:00.000Z", "en")).toBe(expected);
  });

  it("reads as year-month-day with Chinese unit characters", () => {
    expect(formatDate("2026-09-14T03:00:00.000Z", "zh-CN")).toBe(
      "2026年9月14日",
    );
  });

  it("returns an empty string for an unparseable value", () => {
    expect(formatDate("not a date", "en")).toBe("");
    expect(formatDate("not a date", "zh-CN")).toBe("");
  });
});

describe("formatCalendarDate", () => {
  it("does not shift a YYYY-MM-DD date across midnight in either locale", () => {
    expect(formatCalendarDate("2026-08-01", "zh-CN")).toBe("2026年8月1日");
    expect(formatCalendarDate("2026-08-01", "en")).toMatch(/^1 Aug\w* 2026$/);
  });
});

describe("formatDateTime", () => {
  it("includes the time in both locales", () => {
    const iso = "2026-09-14T03:07:00.000Z";
    expect(formatDateTime(iso, "en")).toMatch(/2026/);
    expect(formatDateTime(iso, "en")).toMatch(/:07/);
    expect(formatDateTime(iso, "zh-CN")).toMatch(/^2026年9月14日/);
    expect(formatDateTime(iso, "zh-CN")).toMatch(/:07/);
  });
});

describe("formatNumber / formatCurrencyNzd", () => {
  it("groups thousands in both locales", () => {
    expect(formatNumber(1234567, "en")).toBe("1,234,567");
    expect(formatNumber(1234567, "zh-CN")).toBe("1,234,567");
  });

  it("keeps the NZ dollar and only changes the locale's way of writing it", () => {
    expect(formatCurrencyNzd(123450, "en")).toBe("$1,234.50");
    expect(formatCurrencyNzd(123450, "zh-CN")).toBe("NZ$1,234.50");
  });
});

describe("formatRelativeTime", () => {
  const now = new Date("2026-09-02T12:00:00.000Z");

  it("is byte-identical to the staff queue's English phrasing", () => {
    const at = (iso: string) => formatRelativeTime(iso, "en", relativeEn, now);
    expect(at("2026-09-02T11:59:31.000Z")).toBe("just now");
    expect(at("2026-09-02T11:46:00.000Z")).toBe("14 min ago");
    expect(at("2026-09-02T11:00:00.000Z")).toBe("1 hour ago");
    expect(at("2026-09-02T07:00:00.000Z")).toBe("5 hours ago");
    expect(at("2026-09-01T12:00:00.000Z")).toBe("1 day ago");
    expect(at("2026-08-28T12:00:00.000Z")).toBe("5 days ago");
    // Day-of-month asserted on shape only: the plain-date branch formats in
    // the running process's zone, so "1 Aug" would be "2 Aug" on a machine
    // east of UTC (the same caveat lib/story/moderation-queue-view.test.ts
    // carries for the staff variant).
    expect(at("2026-08-01T12:00:00.000Z")).toMatch(/^\d{1,2} Aug/);
    expect(at("2026-08-01T12:00:00.000Z")).not.toContain("2026");
    expect(at("2025-08-01T12:00:00.000Z")).toContain("2025");
  });

  it("reads naturally in Chinese, with a plain date past a week", () => {
    const at = (iso: string) =>
      formatRelativeTime(iso, "zh-CN", relativeZh, now);
    expect(at("2026-09-02T11:59:31.000Z")).toBe("刚刚");
    expect(at("2026-09-02T11:46:00.000Z")).toBe("14分钟前");
    expect(at("2026-09-02T07:00:00.000Z")).toBe("5小时前");
    expect(at("2026-08-28T12:00:00.000Z")).toBe("5天前");
    expect(at("2026-08-01T12:00:00.000Z")).toMatch(/^8月\d{1,2}日$/);
    expect(at("2025-08-01T12:00:00.000Z")).toMatch(/^2025年8月\d{1,2}日$/);
  });

  it("returns null for nothing or garbage", () => {
    expect(formatRelativeTime(null, "en", relativeEn, now)).toBeNull();
    expect(formatRelativeTime("nope", "zh-CN", relativeZh, now)).toBeNull();
  });
});

describe("formatCountryName", () => {
  it("keeps lib/countries.ts's own English wording untouched", () => {
    // "South Korea", not Intl's "South Korea"/"Korea, Republic of" --
    // English must not start drifting toward the platform's list.
    expect(formatCountryName("KR", "en", "South Korea")).toBe("South Korea");
    expect(formatCountryName("MY", "en", "Malaysia")).toBe("Malaysia");
  });

  it("uses the platform's translated names for Chinese", () => {
    expect(formatCountryName("MY", "zh-CN", "Malaysia")).toBe("马来西亚");
    expect(formatCountryName("NZ", "zh-CN", "New Zealand")).toBe("新西兰");
  });

  it("falls back to the English name, and passes null through", () => {
    // "QQ", not "ZZ": ZZ is CLDR's reserved code for "unknown region" and
    // has a real translated name (未知地区), so it would never exercise the
    // fallback. QQ is genuinely unassigned.
    expect(formatCountryName("QQ", "zh-CN", "Nowhere")).toBe("Nowhere");
    expect(formatCountryName(null, "zh-CN", null)).toBeNull();
    expect(formatCountryName("MY", "zh-CN", null)).toBeNull();
  });
});
