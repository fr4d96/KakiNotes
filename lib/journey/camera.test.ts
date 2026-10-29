import { describe, expect, it } from "vitest";
import { JOURNEY_VIEWBOX } from "@/lib/journey/geo";
import {
  FULL_BOX,
  MAP_ASPECT,
  MAX_CAMERA_ZOOM,
  MAX_MANUAL_ZOOM,
  clampBox,
  clientToSvgPoint,
  panBy,
  zoomAt,
  cameraBoxFor,
  cameraBoxForPoints,
  zoomOf,
} from "@/lib/journey/camera";

const { width, height } = JOURNEY_VIEWBOX;

describe("cameraBoxFor", () => {
  it("never zooms in past the maximum, even for coincident points", () => {
    const box = cameraBoxFor(
      [
        { x: 100, y: 200 },
        { x: 100, y: 200 },
      ],
      0,
    );
    expect(box.w).toBeCloseTo(width / MAX_CAMERA_ZOOM);
    expect(zoomOf(box)).toBeCloseTo(MAX_CAMERA_ZOOM);
  });

  it("matches the requested aspect ratio", () => {
    const pts = [
      { x: 90, y: 100 },
      { x: 150, y: 120 },
    ];
    for (const aspect of [MAP_ASPECT, 1]) {
      const box = cameraBoxFor(pts, 0, aspect);
      expect(box.w / box.h).toBeCloseTo(aspect);
    }
  });

  it("contains both end points of the leg", () => {
    const pts = [
      { x: 80, y: 180 },
      { x: 120, y: 210 },
    ];
    const box = cameraBoxFor(pts, 0);
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(box.x);
      expect(p.x).toBeLessThanOrEqual(box.x + box.w);
      expect(p.y).toBeGreaterThanOrEqual(box.y);
      expect(p.y).toBeLessThanOrEqual(box.y + box.h);
    }
  });

  it("stays inside the picture near its edges and corners", () => {
    const corners = [
      { x: 1, y: 1 },
      { x: width - 1, y: height - 1 },
      { x: width - 1, y: 1 },
    ];
    for (const c of corners) {
      const box = cameraBoxFor([c, { ...c }], 0);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.w).toBeLessThanOrEqual(width + 1e-9);
      expect(box.y + box.h).toBeLessThanOrEqual(height + 1e-9);
    }
  });

  it("returns the full view for a long leg", () => {
    expect(
      cameraBoxFor(
        [
          { x: 150, y: 20 },
          { x: 40, y: 280 },
        ],
        0,
      ),
    ).toEqual(FULL_BOX);
  });

  it("returns the full view when the leg does not exist", () => {
    expect(cameraBoxFor([{ x: 10, y: 10 }], 5)).toEqual(FULL_BOX);
  });
});

describe("manual zoom and pan", () => {
  const mid = { x: 110, y: 150 };

  it("zooms in around the focus, keeping it fixed on screen", () => {
    const box = { x: 0, y: 0, w: 220, h: 300 };
    const focus = { x: 55, y: 75 };
    const next = zoomAt(box, 2, focus);
    expect(next.w).toBeCloseTo(110);
    expect(next.h).toBeCloseTo(150);
    expect((focus.x - next.x) / next.w).toBeCloseTo(0.25);
    expect((focus.y - next.y) / next.h).toBeCloseTo(0.25);
  });

  it("never zooms out past the full view", () => {
    const next = zoomAt(FULL_BOX, 0.1, mid);
    expect(next).toEqual(FULL_BOX);
    const half = zoomAt(FULL_BOX, 2, { x: 0, y: 0 });
    expect(zoomAt(half, 0.01, { x: 5, y: 5 })).toEqual(FULL_BOX);
  });

  it("never zooms in past the manual maximum", () => {
    let box = { ...FULL_BOX };
    for (let i = 0; i < 20; i += 1) box = zoomAt(box, 2, mid);
    expect(box.w).toBeCloseTo(220 / MAX_MANUAL_ZOOM);
    expect(box.w / box.h).toBeCloseTo(220 / 300);
  });

  it("keeps the view inside the picture when zooming near an edge", () => {
    const next = zoomAt(FULL_BOX, 4, { x: 219, y: 299 });
    expect(next.x + next.w).toBeLessThanOrEqual(220 + 1e-9);
    expect(next.y + next.h).toBeLessThanOrEqual(300 + 1e-9);
  });

  it("ignores a nonsense factor", () => {
    expect(zoomAt(FULL_BOX, Number.NaN, mid)).toEqual(FULL_BOX);
    expect(zoomAt(FULL_BOX, 0, mid)).toEqual(FULL_BOX);
  });

  it("pans and clamps to the picture", () => {
    const box = { x: 50, y: 50, w: 110, h: 150 };
    expect(panBy(box, 10, -20)).toEqual({ x: 60, y: 30, w: 110, h: 150 });
    expect(panBy(box, -500, 500)).toEqual({ x: 0, y: 150, w: 110, h: 150 });
    expect(panBy(FULL_BOX, 40, 40)).toEqual(FULL_BOX);
  });

  it("clamps an oversized box to the bounds", () => {
    expect(clampBox({ x: -5, y: 9, w: 400, h: 500 })).toEqual(FULL_BOX);
  });
});

describe("clientToSvgPoint", () => {
  const rect = { left: 10, top: 20, width: 220, height: 300 };

  it("maps a same-aspect element straight onto the box", () => {
    expect(clientToSvgPoint(rect, FULL_BOX, 120, 170)).toEqual({
      x: 110,
      y: 150,
    });
    const zoomed = { x: 50, y: 100, w: 110, h: 150 };
    const p = clientToSvgPoint(rect, zoomed, 10, 20);
    expect(p).toEqual({ x: 50, y: 100 });
  });

  it("accounts for zoom and pan around a focus point", () => {
    const zoomed = zoomAt(FULL_BOX, 4, { x: 150, y: 80 });
    const wide = { left: 0, top: 0, width: 220, height: 300 };
    // The focus stays under the same screen point it was under at zoom 1.
    const before = clientToSvgPoint(wide, FULL_BOX, 150, 80);
    const after = clientToSvgPoint(wide, zoomed, 150, 80);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
    // The element's centre is the box's centre.
    const c = clientToSvgPoint(wide, zoomed, 110, 150);
    expect(c.x).toBeCloseTo(zoomed.x + zoomed.w / 2, 6);
    expect(c.y).toBeCloseTo(zoomed.y + zoomed.h / 2, 6);
  });

  it("accounts for letterboxing in a wide element", () => {
    // 900x300 element, box 220x300: scale 1, 340px of sea each side.
    const wide = { left: 0, top: 0, width: 900, height: 300 };
    expect(clientToSvgPoint(wide, FULL_BOX, 450, 150)).toEqual({
      x: 110,
      y: 150,
    });
    expect(clientToSvgPoint(wide, FULL_BOX, 340, 0)).toEqual({ x: 0, y: 0 });
    const zoomed = { x: 40, y: 60, w: 55, h: 75 }; // 4x
    const p = clientToSvgPoint(wide, zoomed, 450, 150);
    expect(p.x).toBeCloseTo(40 + 27.5, 6);
    expect(p.y).toBeCloseTo(60 + 37.5, 6);
  });
});

describe("cameraBoxForPoints", () => {
  it("frames every point inside the box", () => {
    const pts = [
      { x: 100, y: 200 },
      { x: 112, y: 210 },
      { x: 104, y: 192 },
    ];
    const box = cameraBoxForPoints(pts, { margin: 10, maxZoom: 6 });
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(box.x);
      expect(p.x).toBeLessThanOrEqual(box.x + box.w);
      expect(p.y).toBeGreaterThanOrEqual(box.y);
      expect(p.y).toBeLessThanOrEqual(box.y + box.h);
    }
    expect(box.w).toBeLessThan(FULL_BOX.w);
  });
  it("falls back to the whole picture for no points or a huge spread", () => {
    expect(cameraBoxForPoints([])).toEqual(FULL_BOX);
    expect(
      cameraBoxForPoints([
        { x: 5, y: 5 },
        { x: 215, y: 295 },
      ]),
    ).toEqual(FULL_BOX);
  });
});
