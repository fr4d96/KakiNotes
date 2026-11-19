import { describe, expect, it } from "vitest";
import {
  clampPan,
  clampScale,
  zoomAround,
} from "@/components/ui/use-pinch-zoom";

describe("pinch-zoom maths", () => {
  it("clamps scale to 1x..4x", () => {
    expect(clampScale(0.5)).toBe(1);
    expect(clampScale(2)).toBe(2);
    expect(clampScale(9)).toBe(4);
  });

  it("keeps the point under the pinch midpoint fixed", () => {
    const cx = 200;
    const cy = 300;
    const px = 300;
    const py = 100;
    const next = zoomAround({ scale: 1, tx: 0, ty: 0 }, 2, px, py, cx, cy);
    // Content point under (px, py) before: (px, py). After: c + t + s*(p - c)/1
    // mapped through the new transform must land on the same screen point.
    const screenX = cx + next.tx + (px - cx) * next.scale;
    const screenY = cy + next.ty + (py - cy) * next.scale;
    expect(screenX).toBeCloseTo(px);
    expect(screenY).toBeCloseTo(py);
  });

  it("zooming around the centre does not pan", () => {
    const next = zoomAround({ scale: 1, tx: 0, ty: 0 }, 3, 200, 300, 200, 300);
    expect(next.tx).toBeCloseTo(0);
    expect(next.ty).toBeCloseTo(0);
  });

  it("clamps pan so edges cannot pass the screen edges", () => {
    // 400 wide image at 2x in a 400 wide view: may move +-200.
    expect(clampPan(500, 200, 400, 2, 0, 400)).toBe(200);
    expect(clampPan(-500, 200, 400, 2, 0, 400)).toBe(-200);
    expect(clampPan(50, 200, 400, 2, 0, 400)).toBe(50);
  });

  it("keeps an image smaller than the view centred", () => {
    expect(clampPan(80, 200, 100, 2, 0, 400)).toBe(0);
  });
});
