import { describe, expect, it } from "vitest";
import { formatTripRange, readingMinutes, tripDays } from "./story-glance";

describe("tripDays", () => {
  it("counts both ends, like 4D3N", () => {
    expect(tripDays("2026-11-02", "2026-11-05")).toBe(4);
    expect(tripDays("2026-11-02", "2026-11-02")).toBe(1);
  });

  it("is null without a valid, ordered range", () => {
    expect(tripDays(null, "2026-11-05")).toBeNull();
    expect(tripDays("2026-11-05", "2026-11-02")).toBeNull();
    expect(tripDays("not-a-date", "2026-11-02")).toBeNull();
  });

  it("is not thrown off by a daylight-saving change", () => {
    // NZ daylight saving starts on the last Sunday of September.
    expect(tripDays("2026-09-20", "2026-10-03")).toBe(14);
  });
});

describe("formatTripRange", () => {
  it("uses the locale's own short range", () => {
    expect(formatTripRange("2026-11-02", "2026-11-05", "en")).toBe(
      "2–5 Nov 2026",
    );
    expect(formatTripRange("2026-11-02", "2026-11-05", "zh-CN")).toContain(
      "2026",
    );
  });

  it("never slips a day at the ends", () => {
    expect(formatTripRange("2026-01-01", "2026-01-31", "en")).toBe(
      "1–31 Jan 2026",
    );
  });

  it("is null without a range", () => {
    expect(formatTripRange(null, null, "en")).toBeNull();
  });
});

describe("readingMinutes", () => {
  it("is never below one minute", () => {
    expect(readingMinutes("Short.")).toBe(1);
    expect(readingMinutes("")).toBe(1);
  });

  it("reads about 220 words a minute and ignores Markdown and link targets", () => {
    const words = Array.from({ length: 660 }, () => "word").join(" ");
    expect(
      readingMinutes(`## Day 1\n\n${words} [here](https://example.com/a/b)`),
    ).toBe(3);
  });

  it("counts Chinese by character", () => {
    expect(readingMinutes("好".repeat(1200))).toBe(3);
  });
});
