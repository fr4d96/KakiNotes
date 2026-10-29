import { describe, expect, it } from "vitest";
import {
  JOURNEY_VIEWBOX,
  NZ_BOUNDS,
  cookStraitLegs,
  crossesCookStrait,
  isInsideNz,
  islandOf,
  latLngToPoint,
  pointToLatLng,
  roundCoordinate,
} from "@/lib/journey/geo";

const auckland = { latitude: -36.85, longitude: 174.76 };
const wellington = { latitude: -41.29, longitude: 174.78 };
const picton = { latitude: -41.29, longitude: 174.0 };
const nelson = { latitude: -41.27, longitude: 173.28 };
const christchurch = { latitude: -43.53, longitude: 172.64 };
const queenstown = { latitude: -45.03, longitude: 168.66 };
const taupo = { latitude: -38.69, longitude: 176.07 };
const stewart = { latitude: -46.9, longitude: 168.1 };
const reinga = { latitude: -34.43, longitude: 172.68 };

describe("isInsideNz", () => {
  it("accepts places in New Zealand", () => {
    for (const p of [auckland, queenstown, stewart, reinga]) {
      expect(isInsideNz(p)).toBe(true);
    }
  });
  it("rejects Sydney, the Pacific and non-finite input", () => {
    expect(isInsideNz({ latitude: -33.87, longitude: 151.2 })).toBe(false);
    expect(isInsideNz({ latitude: -40, longitude: 160 })).toBe(false);
    expect(isInsideNz({ latitude: Number.NaN, longitude: 170 })).toBe(false);
  });
  it("includes the boundary itself", () => {
    expect(
      isInsideNz({ latitude: NZ_BOUNDS.minLat, longitude: NZ_BOUNDS.minLng }),
    ).toBe(true);
  });
});

describe("roundCoordinate", () => {
  it("rounds to 2 decimal places", () => {
    expect(roundCoordinate(-45.12345)).toBe(-45.12);
    expect(roundCoordinate(170.999)).toBe(171);
  });
});

describe("projection", () => {
  it("puts the north-west corner at the origin and south-east at the far corner", () => {
    expect(
      latLngToPoint({
        latitude: NZ_BOUNDS.maxLat,
        longitude: NZ_BOUNDS.minLng,
      }),
    ).toEqual({ x: 0, y: 0 });
    const far = latLngToPoint({
      latitude: NZ_BOUNDS.minLat,
      longitude: NZ_BOUNDS.maxLng,
    });
    expect(far.x).toBeCloseTo(JOURNEY_VIEWBOX.width);
    expect(far.y).toBeCloseTo(JOURNEY_VIEWBOX.height);
  });
  it("puts north above south and west left of east", () => {
    const a = latLngToPoint(auckland);
    const c = latLngToPoint(christchurch);
    expect(a.y).toBeLessThan(c.y);
    expect(latLngToPoint(queenstown).x).toBeLessThan(a.x);
  });
  it("round-trips to within 2 dp rounding", () => {
    const back = pointToLatLng(latLngToPoint(queenstown));
    expect(back.latitude).toBeCloseTo(queenstown.latitude, 1);
    expect(back.longitude).toBeCloseTo(queenstown.longitude, 1);
  });
  it("clamps a tap outside the picture into the bounds and rounds to 2 dp", () => {
    const out = pointToLatLng({ x: -50, y: 9999 });
    expect(out.latitude).toBe(NZ_BOUNDS.minLat);
    expect(out.longitude).toBe(NZ_BOUNDS.minLng);
    const mid = pointToLatLng({ x: 73.33, y: 101.1 });
    expect(String(mid.latitude).split(".")[1]?.length ?? 0).toBeLessThanOrEqual(
      2,
    );
    expect(isInsideNz(mid)).toBe(true);
  });
});

describe("islandOf / Cook Strait", () => {
  it("classifies well-known places", () => {
    expect(islandOf(auckland)).toBe("north");
    expect(islandOf(wellington)).toBe("north");
    expect(islandOf(taupo)).toBe("north");
    expect(islandOf(reinga)).toBe("north");
    expect(islandOf(picton)).toBe("south");
    expect(islandOf(nelson)).toBe("south");
    expect(islandOf(christchurch)).toBe("south");
    expect(islandOf(queenstown)).toBe("south");
    expect(islandOf(stewart)).toBe("south");
  });
  it("flags only legs that join the two islands", () => {
    expect(crossesCookStrait(auckland, wellington)).toBe(false);
    expect(crossesCookStrait(picton, queenstown)).toBe(false);
    expect(crossesCookStrait(wellington, picton)).toBe(true);
    expect(crossesCookStrait(queenstown, auckland)).toBe(true);
  });
  it("returns one flag per leg", () => {
    expect(
      cookStraitLegs([auckland, wellington, picton, christchurch, queenstown]),
    ).toEqual([false, true, false, false]);
    expect(cookStraitLegs([auckland])).toEqual([]);
    expect(cookStraitLegs([])).toEqual([]);
  });
});
