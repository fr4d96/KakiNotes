import { describe, expect, it } from "vitest";
import {
  catmullRomSegments,
  closedSmoothPath,
  segmentToPath,
  smoothPath,
} from "@/lib/journey/path";

const pts = [
  { x: 0, y: 0 },
  { x: 10, y: 10 },
  { x: 20, y: 0 },
  { x: 30, y: 10 },
];

describe("catmullRomSegments", () => {
  it("makes one segment per leg that starts and ends on the given points", () => {
    const segs = catmullRomSegments(pts);
    expect(segs).toHaveLength(3);
    segs.forEach((s, i) => {
      expect(s.from).toEqual(pts[i]);
      expect(s.to).toEqual(pts[i + 1]);
    });
  });
  it("is empty for fewer than two points", () => {
    expect(catmullRomSegments([])).toEqual([]);
    expect(catmullRomSegments([{ x: 1, y: 1 }])).toEqual([]);
  });
  it("uses the standard 1/6 tangent for tension 0.5", () => {
    const [, mid] = catmullRomSegments(pts);
    // c1 = p1 + (p2 - p0) / 6
    expect(mid.c1.x).toBeCloseTo(10 + (20 - 0) / 6);
    expect(mid.c1.y).toBeCloseTo(10 + (0 - 0) / 6);
  });
  it("keeps a two-point route straight-ish (controls on the chord)", () => {
    const [s] = catmullRomSegments([
      { x: 0, y: 0 },
      { x: 30, y: 0 },
    ]);
    expect(s.c1.y).toBe(0);
    expect(s.c2.y).toBe(0);
  });
});

describe("smoothPath", () => {
  it("builds a single M followed by one C per leg", () => {
    const d = smoothPath(pts);
    expect(d.startsWith("M0 0C")).toBe(true);
    expect(d.match(/M/g)).toHaveLength(1);
    expect(d.match(/C/g)).toHaveLength(3);
  });
  it("is empty without a leg", () => {
    expect(smoothPath([{ x: 1, y: 1 }])).toBe("");
  });
  it("matches segmentToPath for the first leg", () => {
    const [first] = catmullRomSegments(pts);
    expect(smoothPath(pts).startsWith(segmentToPath(first))).toBe(true);
  });
});

describe("closedSmoothPath", () => {
  it("closes the shape", () => {
    const d = closedSmoothPath([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ]);
    expect(d.endsWith("Z")).toBe(true);
    expect(d.match(/C/g)).toHaveLength(3);
  });
  it("refuses a degenerate outline", () => {
    expect(closedSmoothPath([{ x: 0, y: 0 }])).toBe("");
  });
});
