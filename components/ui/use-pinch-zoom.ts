"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";

/**
 * Pinch / double-tap / keyboard zoom for one <img> at a time, used by the
 * full-screen photo viewer. Touch events (not WebKit gesture events, which
 * NoPinchZoom cancels) on the swipe track, applied as translate + scale on
 * the image only. See photo-lightbox.tsx for how it meets the swipe track.
 */

export const MIN_SCALE = 1;
export const MAX_SCALE = 4;
export const DOUBLE_TAP_SCALE = 2.5;
/** How far below 1x a pinch may travel before it springs back. */
const SOFT_MIN_SCALE = 0.6;
const KEY_STEP = 1.5;
const DOUBLE_TAP_MS = 300;
const TAP_SLOP = 12;

export type ZoomState = { scale: number; tx: number; ty: number };
export const REST: ZoomState = { scale: 1, tx: 0, ty: 0 };

export const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

export const clampScale = (scale: number) => clamp(scale, MIN_SCALE, MAX_SCALE);

/**
 * New state after scaling to `nextScale` while keeping the content point
 * under (px, py) fixed. `cx, cy` is the image's resting centre; the
 * transform origin is that centre.
 */
export function zoomAround(
  state: ZoomState,
  nextScale: number,
  px: number,
  py: number,
  cx: number,
  cy: number,
): ZoomState {
  const k = nextScale / state.scale;
  return {
    scale: nextScale,
    tx: px - cx - k * (px - cx - state.tx),
    ty: py - cy - k * (py - cy - state.ty),
  };
}

/**
 * Clamp one axis of the pan so the scaled image's edges stay on or outside
 * the viewport edges `lo`..`hi`. When the image is smaller than the viewport
 * on that axis it stays centred on its resting position.
 */
export function clampPan(
  t: number,
  center: number,
  size: number,
  scale: number,
  lo: number,
  hi: number,
): number {
  const half = (size * scale) / 2;
  if (half * 2 <= hi - lo) return 0;
  return clamp(t, hi - half - center, lo + half - center);
}

type Rect = { left: number; top: number; width: number; height: number };

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

const toCss = (s: ZoomState) =>
  s.scale === 1 && s.tx === 0 && s.ty === 0
    ? ""
    : `translate(${s.tx}px, ${s.ty}px) scale(${s.scale})`;

export function usePinchZoom({
  surfaceRef,
  getImg,
  enabled,
}: {
  /** The element that receives the touches (the swipe track). */
  surfaceRef: RefObject<HTMLElement | null>;
  /** The image to zoom right now (the current slide's). */
  getImg: () => HTMLElement | null;
  enabled: boolean;
}) {
  const state = useRef<ZoomState>(REST);
  const target = useRef<HTMLElement | null>(null);
  const getImgRef = useRef(getImg);
  useEffect(() => {
    getImgRef.current = getImg;
  });
  /** True while a touch gesture owns the surface (pinch, or pan when zoomed). */
  const gesturing = useRef(false);

  const geometry = useCallback(
    (img: HTMLElement) => {
      const r = img.getBoundingClientRect();
      const s = state.current;
      const w = r.width / s.scale || img.offsetWidth;
      const h = r.height / s.scale || img.offsetHeight;
      const surface = surfaceRef.current?.getBoundingClientRect();
      const view: Rect = surface ?? {
        left: 0,
        top: 0,
        width: window.innerWidth,
        height: window.innerHeight,
      };
      return {
        w,
        h,
        cx: r.left + r.width / 2 - s.tx,
        cy: r.top + r.height / 2 - s.ty,
        view,
      };
    },
    [surfaceRef],
  );

  const clampState = useCallback(
    (img: HTMLElement, s: ZoomState): ZoomState => {
      if (s.scale <= 1) return { scale: s.scale, tx: 0, ty: 0 };
      const g = geometry(img);
      return {
        scale: s.scale,
        tx: clampPan(
          s.tx,
          g.cx,
          g.w,
          s.scale,
          g.view.left,
          g.view.left + g.view.width,
        ),
        ty: clampPan(
          s.ty,
          g.cy,
          g.h,
          s.scale,
          g.view.top,
          g.view.top + g.view.height,
        ),
      };
    },
    [geometry],
  );

  const apply = useCallback(
    (img: HTMLElement, next: ZoomState, animate: boolean) => {
      const from = img.style.transform || "none";
      state.current = next;
      target.current = img;
      img.style.transform = toCss(next);
      // Zoomed: the image owns every touch. At rest the swipe track keeps
      // its own one-finger pan-x; pinch is taken via preventDefault.
      img.style.touchAction = next.scale > 1 ? "none" : "";
      if (
        animate &&
        !prefersReducedMotion() &&
        typeof img.animate === "function"
      ) {
        img.animate(
          [{ transform: from }, { transform: img.style.transform || "none" }],
          {
            duration: 240,
            easing: "cubic-bezier(0.2, 0.75, 0.25, 1)",
          },
        );
      }
    },
    [],
  );

  const reset = useCallback(() => {
    gesturing.current = false;
    if (target.current) {
      target.current.style.transform = "";
      target.current.style.touchAction = "";
    }
    target.current = null;
    state.current = REST;
  }, []);

  /** Zoom to `scale` around (px, py) (default: the image's centre). */
  const zoomTo = useCallback(
    (scale: number, px?: number, py?: number, animate = true) => {
      const img = getImgRef.current();
      if (!img) return;
      if (target.current && target.current !== img) reset();
      const g = geometry(img);
      const next = clampScale(scale);
      const moved = zoomAround(
        state.current,
        next,
        px ?? g.cx,
        py ?? g.cy,
        g.cx,
        g.cy,
      );
      apply(img, clampState(img, moved), animate);
    },
    [apply, clampState, geometry, reset],
  );

  const zoomBy = useCallback(
    (factor: number) => zoomTo(state.current.scale * factor),
    [zoomTo],
  );

  const handleKey = useCallback(
    (key: string): boolean => {
      if (key === "+" || key === "=") zoomBy(KEY_STEP);
      else if (key === "-" || key === "_") zoomBy(1 / KEY_STEP);
      else if (key === "0") {
        const img = getImgRef.current();
        if (img && state.current.scale !== 1) apply(img, REST, true);
      } else return false;
      return true;
    },
    [apply, zoomBy],
  );

  const isZoomed = useCallback(() => state.current.scale > 1, []);
  const isGesturing = useCallback(
    () => gesturing.current || state.current.scale !== 1,
    [],
  );

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!enabled || !surface) return;

    let pinch: { dist: number; mx: number; my: number } | null = null;
    let pan: { x: number; y: number } | null = null;
    let tap: { t: number; x: number; y: number } | null = null;
    let lastTap: { t: number; x: number; y: number } | null = null;

    const mid = (a: Touch, b: Touch) => ({
      mx: (a.clientX + b.clientX) / 2,
      my: (a.clientY + b.clientY) / 2,
      dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
    });

    const onStart = (e: TouchEvent) => {
      const img = getImgRef.current();
      if (!img) return;
      if (target.current && target.current !== img) reset();
      if (e.touches.length >= 2) {
        gesturing.current = true;
        pinch = mid(e.touches[0], e.touches[1]);
        pan = null;
        tap = null;
        lastTap = null;
        e.preventDefault();
      } else if (e.touches.length === 1) {
        const t = e.touches[0];
        pan = state.current.scale > 1 ? { x: t.clientX, y: t.clientY } : null;
        gesturing.current = pan !== null;
        tap =
          e.target === img
            ? { t: e.timeStamp, x: t.clientX, y: t.clientY }
            : null;
      }
    };

    const onMove = (e: TouchEvent) => {
      const img = getImgRef.current();
      if (!img) return;
      if (e.touches.length >= 2 && pinch) {
        e.preventDefault();
        const m = mid(e.touches[0], e.touches[1]);
        const g = geometry(img);
        const s = state.current;
        const scale = clamp(
          s.scale * (m.dist / (pinch.dist || m.dist)),
          SOFT_MIN_SCALE,
          MAX_SCALE,
        );
        let next = zoomAround(s, scale, pinch.mx, pinch.my, g.cx, g.cy);
        next = {
          ...next,
          tx: next.tx + (m.mx - pinch.mx),
          ty: next.ty + (m.my - pinch.my),
        };
        apply(img, clampState(img, next), false);
        pinch = m;
        return;
      }
      if (e.touches.length === 1 && pan && state.current.scale > 1) {
        e.preventDefault();
        const t = e.touches[0];
        const s = state.current;
        apply(
          img,
          clampState(img, {
            scale: s.scale,
            tx: s.tx + t.clientX - pan.x,
            ty: s.ty + t.clientY - pan.y,
          }),
          false,
        );
        pan = { x: t.clientX, y: t.clientY };
        if (
          tap &&
          Math.hypot(t.clientX - tap.x, t.clientY - tap.y) > TAP_SLOP
        ) {
          tap = null;
        }
      } else if (tap && e.touches.length === 1) {
        const t = e.touches[0];
        if (Math.hypot(t.clientX - tap.x, t.clientY - tap.y) > TAP_SLOP) {
          tap = null;
        }
      }
    };

    const onEnd = (e: TouchEvent) => {
      const img = getImgRef.current();
      if (!img) return;
      if (e.touches.length === 0) {
        pinch = null;
        pan = null;
        gesturing.current = false;
        if (state.current.scale < 1) apply(img, REST, true);
        if (tap && e.changedTouches.length === 1) {
          const t = e.changedTouches[0];
          const quick = e.timeStamp - tap.t < DOUBLE_TAP_MS;
          const second =
            lastTap &&
            e.timeStamp - lastTap.t < DOUBLE_TAP_MS &&
            Math.hypot(t.clientX - lastTap.x, t.clientY - lastTap.y) < 30;
          if (quick && second) {
            lastTap = null;
            if (state.current.scale > 1) apply(img, REST, true);
            else zoomTo(DOUBLE_TAP_SCALE, t.clientX, t.clientY);
          } else if (quick) {
            lastTap = { t: e.timeStamp, x: t.clientX, y: t.clientY };
          }
        }
        tap = null;
      } else if (e.touches.length === 1) {
        // Pinch finished with one finger left: carry on as a pan.
        pinch = null;
        const t = e.touches[0];
        pan = state.current.scale > 1 ? { x: t.clientX, y: t.clientY } : null;
        tap = null;
      }
    };

    const onCancel = () => {
      pinch = null;
      pan = null;
      tap = null;
      gesturing.current = false;
      const img = getImgRef.current();
      if (img && state.current.scale < 1) apply(img, REST, true);
    };

    const opts = { passive: false } as const;
    surface.addEventListener("touchstart", onStart, opts);
    surface.addEventListener("touchmove", onMove, opts);
    surface.addEventListener("touchend", onEnd);
    surface.addEventListener("touchcancel", onCancel);
    return () => {
      surface.removeEventListener("touchstart", onStart);
      surface.removeEventListener("touchmove", onMove);
      surface.removeEventListener("touchend", onEnd);
      surface.removeEventListener("touchcancel", onCancel);
    };
  }, [enabled, surfaceRef, geometry, apply, clampState, reset, zoomTo]);

  return { reset, zoomTo, zoomBy, handleKey, isZoomed, isGesturing };
}
