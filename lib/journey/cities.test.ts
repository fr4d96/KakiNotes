import { describe, expect, it } from "vitest";
import {
  CITIES,
  TIER2_MIN_ZOOM,
  cityLabelCovered,
  cityLabelRect,
  cityZoomOpacity,
} from "@/lib/journey/cities";
import { isInsideNz } from "@/lib/journey/geo";

describe("CITIES", () => {
  it("has the three tier-1 cities and everything inside NZ", () => {
    expect(CITIES.filter((c) => c.tier === 1).map((c) => c.name)).toEqual([
      "Auckland",
      "Wellington",
      "Christchurch",
    ]);
    expect(CITIES.every(isInsideNz)).toBe(true);
  });
});

describe("cityZoomOpacity", () => {
  it("always shows tier 1 and fades tier 2 in around TIER2_MIN_ZOOM", () => {
    expect(cityZoomOpacity(1, 1)).toBe(1);
    expect(cityZoomOpacity(2, 1)).toBe(0);
    expect(cityZoomOpacity(2, TIER2_MIN_ZOOM - 0.5)).toBe(0);
    const mid = cityZoomOpacity(2, TIER2_MIN_ZOOM - 0.1);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(cityZoomOpacity(2, TIER2_MIN_ZOOM)).toBe(1);
    expect(cityZoomOpacity(2, 3)).toBe(1);
  });
});

describe("cityLabelCovered", () => {
  const label = cityLabelRect(CITIES[0]);
  it("hides under a nearby stop, not a distant one", () => {
    expect(cityLabelCovered(label, [{ x: 0, y: 0 }], [])).toBe(true);
    expect(cityLabelCovered(label, [{ x: 2, y: label.y1 + 2 }], [])).toBe(true);
    expect(cityLabelCovered(label, [{ x: 60, y: 60 }], [])).toBe(false);
  });
  it("hides when a chip overlaps, not when it only sits nearby", () => {
    const over = { x0: 5, y0: -3, x1: 30, y1: 4 };
    const clear = { x0: 5, y0: label.y1 + 1, x1: 30, y1: label.y1 + 10 };
    expect(cityLabelCovered(label, [], [over])).toBe(true);
    expect(cityLabelCovered(label, [], [clear])).toBe(false);
  });
});
