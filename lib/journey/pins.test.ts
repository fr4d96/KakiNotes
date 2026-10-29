import { describe, expect, it } from "vitest";
import { latLngToPoint, type Point } from "@/lib/journey/geo";
import { getMainIslands } from "@/lib/journey/map-paths";
import { distToPolygon, pointInPolygon } from "@/lib/journey/polygon";
import {
  MAX_STRAIT_PULL,
  PIN_OUTER_RADIUS,
  spreadPins,
} from "@/lib/journey/pins";

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

describe("spreadPins", () => {
  it("separates Wellington and Picton, which overlap on the picture", () => {
    const wellington = latLngToPoint({ latitude: -41.29, longitude: 174.78 });
    const picton = latLngToPoint({ latitude: -41.27, longitude: 174.0 });
    expect(dist(wellington, picton)).toBeLessThan(17);
    const [a, b] = spreadPins([wellington, picton], 17);
    expect(dist(a, b)).toBeGreaterThanOrEqual(17 - 0.01);
  });

  it("does not mutate its input and leaves distant pins alone", () => {
    const input: Point[] = [
      { x: 20, y: 20 },
      { x: 150, y: 250 },
    ];
    const copy = JSON.parse(JSON.stringify(input));
    const out = spreadPins(input, 17);
    expect(input).toEqual(copy);
    expect(out).toEqual(input);
    expect(out[0]).not.toBe(input[0]);
  });

  it("handles coincident pins and clusters", () => {
    const pts: Point[] = [
      { x: 100, y: 100 },
      { x: 100, y: 100 },
      { x: 104, y: 101 },
    ];
    const out = spreadPins(pts, 16);
    for (let i = 0; i < out.length; i += 1) {
      for (let j = i + 1; j < out.length; j += 1) {
        expect(dist(out[i], out[j])).toBeGreaterThanOrEqual(15.9);
      }
    }
  });

  it("keeps pins inside the picture", () => {
    const out = spreadPins(
      [
        { x: 1, y: 1 },
        { x: 2, y: 2 },
      ],
      17,
    );
    for (const p of out) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("spreadPins at Cook Strait", () => {
  const wellington = latLngToPoint({ latitude: -41.29, longitude: 174.78 });
  const picton = latLngToPoint({ latitude: -41.27, longitude: 174.0 });
  const auckland = latLngToPoint({ latitude: -36.85, longitude: 174.76 });
  const rotorua = latLngToPoint({ latitude: -38.14, longitude: 176.25 });
  const queenstown = latLngToPoint({ latitude: -45.03, longitude: 168.66 });
  const { north, south } = getMainIslands();

  it("keeps both strait pins on their own island with water between circles", () => {
    const [w, p] = spreadPins([wellington, picton], 17);
    expect(pointInPolygon(w, north)).toBe(true);
    expect(pointInPolygon(p, south)).toBe(true);
    expect(dist(w, wellington)).toBeLessThanOrEqual(MAX_STRAIT_PULL + 1);
    expect(dist(p, picton)).toBeLessThanOrEqual(MAX_STRAIT_PULL + 1);
    // circles must not reach across the strait
    expect(distToPolygon(w, south)).toBeGreaterThan(PIN_OUTER_RADIUS + 4);
    expect(distToPolygon(p, north)).toBeGreaterThan(PIN_OUTER_RADIUS + 4);
    // visible water between the two displayed pin edges
    expect(dist(w, p) - 2 * PIN_OUTER_RADIUS).toBeGreaterThanOrEqual(6);
  });

  it("leaves pins away from the strait effectively unchanged, without mutating input", () => {
    const input = [auckland, rotorua, queenstown, wellington, picton];
    const copy = JSON.parse(JSON.stringify(input));
    const out = spreadPins(input, 17);
    expect(input).toEqual(copy);
    for (let i = 0; i < 3; i += 1)
      expect(dist(out[i], input[i])).toBeLessThan(1);
  });
});
