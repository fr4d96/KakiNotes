import { describe, expect, it } from "vitest";
import { NZ_BOUNDS, JOURNEY_VIEWBOX, latLngToPoint } from "@/lib/journey/geo";
import {
  getMainIslands,
  getMapPaths,
  pointsToPath,
} from "@/lib/journey/map-paths";
import { NZ_LAKES, NZ_LAND, NZ_ROADS } from "@/lib/journey/nz-map-data";

describe("pointsToPath", () => {
  it("writes compact M/L paths, optionally closed", () => {
    expect(
      pointsToPath([
        { x: 1, y: 2.345 },
        { x: 3.5, y: 4 },
      ]),
    ).toBe("M1 2.35L3.5 4");
    expect(pointsToPath([{ x: 1, y: 2 }], true)).toBe("M1 2Z");
    expect(pointsToPath([])).toBe("");
  });
});

describe("getMapPaths", () => {
  it("is memoised and produces one subpath per ring / line", () => {
    const a = getMapPaths();
    expect(getMapPaths()).toBe(a);
    expect(a.land.match(/M/g)).toHaveLength(NZ_LAND.length);
    expect(a.land.match(/Z/g)).toHaveLength(NZ_LAND.length);
    expect(a.lakes.match(/M/g)).toHaveLength(NZ_LAKES.length);
    const major = NZ_ROADS.filter((r) => r.kind === "major").length;
    expect(a.majorRoads.match(/M/g)).toHaveLength(major);
    expect(a.secondaryRoads.match(/M/g)).toHaveLength(NZ_ROADS.length - major);
    expect(major).toBeGreaterThan(0);
  });

  it("stays inside the picture's box", () => {
    const { land, majorRoads, secondaryRoads } = getMapPaths();
    for (const d of [land, majorRoads, secondaryRoads]) {
      for (const [, x, y] of d
        .matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)
        .map((m) => [m[0], Number(m[1]), Number(m[2])] as const)) {
        expect(x).toBeGreaterThanOrEqual(-0.5);
        expect(x).toBeLessThanOrEqual(JOURNEY_VIEWBOX.width + 0.5);
        expect(y).toBeGreaterThanOrEqual(-0.5);
        expect(y).toBeLessThanOrEqual(JOURNEY_VIEWBOX.height + 0.5);
      }
    }
  });
});

describe("projection", () => {
  it("does not stretch the islands (x/y scale ~ cos latitude)", () => {
    const mid = (NZ_BOUNDS.minLat + NZ_BOUNDS.maxLat) / 2;
    const dx =
      latLngToPoint({ latitude: mid, longitude: 175 }).x -
      latLngToPoint({ latitude: mid, longitude: 174 }).x;
    const dy =
      latLngToPoint({ latitude: mid, longitude: 175 }).y -
      latLngToPoint({ latitude: mid - 1, longitude: 175 }).y;
    const ratio = Math.abs(dx / dy) / Math.cos((-41 * Math.PI) / 180);
    expect(ratio).toBeGreaterThan(0.95);
    expect(ratio).toBeLessThan(1.05);
  });
});

describe("getMainIslands", () => {
  it("returns the largest North and South Island rings", () => {
    const { north, south } = getMainIslands();
    expect(getMainIslands().north).toBe(north);
    const auckland = latLngToPoint({ latitude: -36.85, longitude: 174.76 });
    const xs = north.map((p) => p.x);
    expect(Math.min(...xs)).toBeLessThan(auckland.x);
    expect(south.length).toBeGreaterThan(100);
  });
});
