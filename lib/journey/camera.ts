import { JOURNEY_VIEWBOX } from "@/lib/journey/geo";
import type { Point } from "@/lib/journey/geo";

/** A rectangle in SVG user space: what the journey picture's viewBox shows. */
export type CameraBox = { x: number; y: number; w: number; h: number };

/** Furthest the automatic camera zooms in. */
export const MAX_CAMERA_ZOOM = 4;
/** Room left around the leg's end points, in SVG units. */
export const CAMERA_MARGIN = 24;
/** A box this close to the full width is just the full view. */
const FULL_VIEW_THRESHOLD = 0.9;

export const FULL_BOX: CameraBox = {
  x: 0,
  y: 0,
  w: JOURNEY_VIEWBOX.width,
  h: JOURNEY_VIEWBOX.height,
};

export const MAP_ASPECT = JOURNEY_VIEWBOX.width / JOURNEY_VIEWBOX.height;

/** How far in a box is zoomed (1 = the whole picture). */
export function zoomOf(box: CameraBox, bounds = JOURNEY_VIEWBOX): number {
  return bounds.width / box.w;
}

/**
 * DISPLAY-ONLY. The part of the picture the automatic camera frames while the
 * van is at / driving leg `legIndex` (stop legIndex -> legIndex + 1): the
 * leg's two end points plus a margin, never closer than `1 / maxZoom` of the
 * picture, always the picture's aspect ratio and always inside `bounds`. A
 * leg so long that the box would nearly fill the picture simply returns the
 * full view. This is the automatic camera; readers take over with zoomAt/panBy below.
 */
export function cameraBoxFor(
  points: readonly Point[],
  legIndex: number,
  aspect: number = MAP_ASPECT,
  bounds: { width: number; height: number } = JOURNEY_VIEWBOX,
  options: { margin?: number; maxZoom?: number } = {},
): CameraBox {
  const margin = options.margin ?? CAMERA_MARGIN;
  const maxZoom = options.maxZoom ?? MAX_CAMERA_ZOOM;
  const full: CameraBox = { x: 0, y: 0, w: bounds.width, h: bounds.height };

  const ends = [points[legIndex], points[legIndex + 1]].filter(
    (p): p is Point => Boolean(p),
  );
  if (ends.length === 0) return full;

  const minX = Math.min(...ends.map((p) => p.x));
  const maxX = Math.max(...ends.map((p) => p.x));
  const minY = Math.min(...ends.map((p) => p.y));
  const maxY = Math.max(...ends.map((p) => p.y));

  // Widest the box can be and still have the requested aspect inside bounds.
  const widest = Math.min(bounds.width, bounds.height * aspect);
  let w = Math.max(
    maxX - minX + 2 * margin,
    (maxY - minY + 2 * margin) * aspect,
    bounds.width / maxZoom,
  );
  if (w >= widest * FULL_VIEW_THRESHOLD) return full;
  w = Math.min(w, widest);
  const h = w / aspect;

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return {
    x: Math.min(bounds.width - w, Math.max(0, cx - w / 2)),
    y: Math.min(bounds.height - h, Math.max(0, cy - h / 2)),
    w,
    h,
  };
}

/**
 * DISPLAY-ONLY. The box that frames ALL of `points` with `margin` SVG units
 * of room: used when a main stop is opened to show its sub-stops. Built on
 * cameraBoxFor() by treating the points' bounding corners as a "leg", so the
 * aspect ratio, bounds and nearly-full-view rules are identical.
 */
export function cameraBoxForPoints(
  points: readonly Point[],
  options: { margin?: number; maxZoom?: number } = {},
  aspect: number = MAP_ASPECT,
  bounds: { width: number; height: number } = JOURNEY_VIEWBOX,
): CameraBox {
  if (points.length === 0) {
    return { x: 0, y: 0, w: bounds.width, h: bounds.height };
  }
  const corners: Point[] = [
    {
      x: Math.min(...points.map((p) => p.x)),
      y: Math.min(...points.map((p) => p.y)),
    },
    {
      x: Math.max(...points.map((p) => p.x)),
      y: Math.max(...points.map((p) => p.y)),
    },
  ];
  return cameraBoxFor(corners, 0, aspect, bounds, options);
}

/** Furthest a reader can zoom in by hand (the automatic camera stops at 4x). */
export const MAX_MANUAL_ZOOM = 8;

type Bounds = { width: number; height: number };

/**
 * Slide a box so it lies inside `bounds` (a box as large as the bounds just
 * becomes the bounds). Size is never changed here beyond capping it to bounds.
 */
export function clampBox(
  box: CameraBox,
  bounds: Bounds = JOURNEY_VIEWBOX,
): CameraBox {
  const w = Math.min(box.w, bounds.width);
  const h = Math.min(box.h, bounds.height);
  return {
    x: Math.min(bounds.width - w, Math.max(0, box.x)),
    y: Math.min(bounds.height - h, Math.max(0, box.y)),
    w,
    h,
  };
}

/**
 * DISPLAY-ONLY, reader-driven. Zoom `box` by `factor` (> 1 zooms in) keeping
 * `focus` (a point in SVG space) at the same place on screen. The result keeps
 * the box's aspect ratio, never shows less than `bounds / maxZoom` nor more
 * than the whole of `bounds`, and stays inside `bounds`.
 */
export function zoomAt(
  box: CameraBox,
  factor: number,
  focus: Point,
  bounds: Bounds = JOURNEY_VIEWBOX,
  limits: { minZoom?: number; maxZoom?: number } = {},
): CameraBox {
  const minZoom = limits.minZoom ?? 1;
  const maxZoom = limits.maxZoom ?? MAX_MANUAL_ZOOM;
  if (!Number.isFinite(factor) || factor <= 0) return clampBox(box, bounds);
  const aspect = box.w / box.h;
  const w = Math.min(
    bounds.width / minZoom,
    Math.max(bounds.width / maxZoom, box.w / factor),
  );
  const h = w / aspect;
  const fx = (focus.x - box.x) / box.w;
  const fy = (focus.y - box.y) / box.h;
  return clampBox({ x: focus.x - fx * w, y: focus.y - fy * h, w, h }, bounds);
}

/** Move a box by (dx, dy) SVG units, staying inside `bounds`. */
export function panBy(
  box: CameraBox,
  dx: number,
  dy: number,
  bounds: Bounds = JOURNEY_VIEWBOX,
): CameraBox {
  return clampBox({ ...box, x: box.x + dx, y: box.y + dy }, bounds);
}

/** The on-screen rectangle (CSS px) of the <svg> element. */
export type ScreenRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/**
 * How `box` is laid out inside an <svg> element of size `rect` with the
 * default preserveAspectRatio ("xMidYMid meet"): pixels per SVG unit, and
 * the letterbox margins (px) left over on the shorter axis. When the element
 * has the box's own aspect ratio, the margins are 0.
 */
export function screenFit(rect: ScreenRect, box: CameraBox) {
  const scale = Math.min(rect.width / box.w, rect.height / box.h);
  return {
    scale,
    offsetX: (rect.width - box.w * scale) / 2,
    offsetY: (rect.height - box.h * scale) / 2,
  };
}

/**
 * A screen point as a point in SVG space for the viewBox `box` currently
 * showing, accounting for zoom/pan (the box) and letterboxing. Outside the
 * box's own area (in the letterbox) the result lies outside `box`.
 */
export function clientToSvgPoint(
  rect: ScreenRect,
  box: CameraBox,
  clientX: number,
  clientY: number,
): Point {
  if (rect.width <= 0 || rect.height <= 0) {
    return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
  }
  const { scale, offsetX, offsetY } = screenFit(rect, box);
  return {
    x: box.x + (clientX - rect.left - offsetX) / scale,
    y: box.y + (clientY - rect.top - offsetY) / scale,
  };
}
