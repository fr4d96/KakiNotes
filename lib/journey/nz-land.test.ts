import { describe, expect, it } from "vitest";
import { latLngToPoint, type Point } from "@/lib/journey/geo";
import { getMainIslands } from "@/lib/journey/map-paths";
import {
  distToPolygon as distToPoly,
  pointInPolygon as inside,
} from "@/lib/journey/polygon";

function cross(o: Point, a: Point, b: Point) {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}
function segmentsCross(a: Point, b: Point, c: Point, d: Point) {
  return (
    cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0
  );
}
function polysIntersect(p: Point[], q: Point[]) {
  for (let i = 0; i < p.length; i += 1) {
    for (let j = 0; j < q.length; j += 1) {
      if (
        segmentsCross(p[i], p[(i + 1) % p.length], q[j], q[(j + 1) % q.length])
      ) {
        return true;
      }
    }
  }
  return false;
}

const { north, south } = getMainIslands();
const wellington = latLngToPoint({ latitude: -41.29, longitude: 174.78 });
const picton = latLngToPoint({ latitude: -41.27, longitude: 174.0 });
/** Distance (SVG units) within which a pin counts as "on" an island. */
const ON_ISLAND = 3;

describe("NZ land (Natural Earth)", () => {
  it("keeps Wellington on the North Island and Picton on the South Island", () => {
    expect(
      inside(wellington, north) || distToPoly(wellington, north) < ON_ISLAND,
    ).toBe(true);
    expect(inside(picton, south) || distToPoly(picton, south) < ON_ISLAND).toBe(
      true,
    );
    expect(distToPoly(wellington, north)).toBeLessThan(
      distToPoly(wellington, south),
    );
    expect(distToPoly(picton, south)).toBeLessThan(distToPoly(picton, north));
  });

  it("does not intersect or nest the two islands", () => {
    expect(polysIntersect(north, south)).toBe(false);
    expect(inside(south[0], north)).toBe(false);
    expect(inside(north[0], south)).toBe(false);
  });

  it("keeps Cook Strait a real, narrow channel (real data: ~4-8 units)", () => {
    let min = Infinity;
    for (const p of north) min = Math.min(min, distToPoly(p, south));
    expect(min).toBeGreaterThanOrEqual(2.5);
    expect(min).toBeLessThanOrEqual(9);
  });

  it("finds the two main islands, not the small offshore rings", () => {
    expect(north.length).toBeGreaterThan(200);
    expect(south.length).toBeGreaterThan(200);
  });
});
