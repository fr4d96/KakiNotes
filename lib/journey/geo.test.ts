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
import {
  getJourneyGeography,
  isInsideCountry,
} from "@/lib/journey/geographies";

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

describe("Malaysia inset geography", () => {
  const KL = { latitude: 3.15, longitude: 101.71 };
  const KK = { latitude: 5.98, longitude: 116.07 };
  const panels = getJourneyGeography("malaysia").panels;

  it("draws Kuala Lumpur in the Peninsular panel and Kota Kinabalu in the Borneo panel", () => {
    const kl = latLngToPoint(KL, "malaysia");
    const kk = latLngToPoint(KK, "malaysia");
    expect(kl.x).toBeGreaterThanOrEqual(panels[0].x);
    expect(kl.x).toBeLessThanOrEqual(panels[0].x + panels[0].width);
    expect(kl.y).toBeGreaterThanOrEqual(panels[0].y);
    expect(kl.y).toBeLessThanOrEqual(panels[0].y + panels[0].height);
    expect(kk.y).toBeGreaterThanOrEqual(panels[1].y);
    expect(kk.y).toBeLessThanOrEqual(panels[1].y + panels[1].height);
    expect(kk.y).toBeGreaterThan(kl.y);
  });

  it("round-trips through pointToLatLng within 0.01 degrees", () => {
    for (const ll of [KL, KK]) {
      const back = pointToLatLng(latLngToPoint(ll, "malaysia"), "malaysia");
      expect(Math.abs(back.latitude - ll.latitude)).toBeLessThanOrEqual(0.01);
      expect(Math.abs(back.longitude - ll.longitude)).toBeLessThanOrEqual(0.01);
    }
  });

  it("snaps a point between the panels to the nearer one", () => {
    const gapY = panels[0].y + panels[0].height + 1;
    const back = pointToLatLng({ x: 50, y: gapY }, "malaysia");
    expect(back.latitude).toBeCloseTo(0.8, 1);
    expect(back.longitude).toBeLessThan(104.9);
  });

  it("isInsideCountry means inside one of the two panels", () => {
    expect(isInsideCountry("malaysia", KL)).toBe(true);
    expect(isInsideCountry("malaysia", KK)).toBe(true);
    expect(isInsideCountry("malaysia", { latitude: 3, longitude: 107 })).toBe(
      false,
    );
    expect(
      isInsideCountry("malaysia", { latitude: -36.85, longitude: 174.76 }),
    ).toBe(false);
    expect(
      isInsideCountry("new-zealand", { latitude: -36.85, longitude: 174.76 }),
    ).toBe(true);
    expect(isInsideCountry("new-zealand", KL)).toBe(false);
  });

  it("tells Peninsular from Borneo for crossing legs", () => {
    expect(crossesCookStrait(KL, KK, "malaysia")).toBe(true);
    expect(
      crossesCookStrait(KL, { latitude: 5.41, longitude: 100.34 }, "malaysia"),
    ).toBe(false);
    expect(getJourneyGeography("malaysia").crossingVehicle).toBe("plane");
    expect(getJourneyGeography("new-zealand").crossingVehicle).toBe("ferry");
  });
});
