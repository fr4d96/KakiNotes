"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import type { Point } from "@/lib/journey/geo";
import {
  clientToSvgPoint,
  panBy,
  screenFit,
  zoomAt,
  type CameraBox,
} from "@/lib/journey/camera";

/**
 * The reader's zoom/pan interaction model for the journey picture, shared by
 * the reader map and the contributor's stops editor: Ctrl/Cmd+wheel (with a
 * hint for a plain wheel), two-finger pinch/drag, mouse drag, one-finger
 * touch left to scroll the page (with a hint), double-click / double-tap
 * zoom, and keyboard +/- and arrows. The host owns the camera itself and
 * passes `getBase` (current box) and `setView` (apply a new box).
 */

export type MapHint = "wheel" | "wheelMac" | "touch";

/** Button / keyboard zoom step, double-click zoom, and keyboard pan step. */
export const BUTTON_ZOOM = 1.6;
export const DOUBLE_ZOOM = 2;
const KEY_PAN = 0.12;
/** Pointer travel (px) before a press becomes a drag / a touch is "a swipe". */
const DRAG_SLOP = 4;
const SWIPE_SLOP = 10;
const HINT_MS = 1600;

type PointerInfo = { x: number; y: number; type: string };
type GestureState = {
  pointers: Map<number, PointerInfo>;
  drag: { id: number; sx: number; sy: number; lx: number; ly: number } | null;
  dragging: boolean;
  pinch: { dist: number; mx: number; my: number } | null;
  touch: { x: number; y: number; hinted: boolean } | null;
  lastType: string;
  lastTap: { t: number; x: number; y: number };
  /** True once this press moved, dragged or pinched: its click is not a tap. */
  moved: boolean;
};

export const isMac = () =>
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || "");

export function useMapGestures({
  svgRef,
  getBase,
  setView,
  maxZoom,
  doubleZoom = true,
  rebindKey,
}: {
  svgRef: RefObject<SVGSVGElement | null>;
  getBase: () => CameraBox;
  setView: (next: CameraBox, animate: boolean) => void;
  /** Furthest in the reader can zoom (zoomAt's default when omitted). */
  maxZoom?: number;
  /** Double-click / double-tap zoom. The editor turns it off. */
  doubleZoom?: boolean;
  /** Re-attach the native listeners when this changes (the svg remounts). */
  rebindKey?: unknown;
}) {
  const [hint, setHint] = useState<MapHint | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gesture = useRef<GestureState>({
    pointers: new Map(),
    drag: null,
    dragging: false,
    pinch: null,
    touch: null,
    lastType: "mouse",
    lastTap: { t: 0, x: 0, y: 0 },
    moved: false,
  });
  const limits = maxZoom ? { maxZoom } : undefined;

  const showHint = useCallback((kind: MapHint) => {
    setHint(kind);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(null), HINT_MS);
  }, []);
  useEffect(
    () => () => {
      if (hintTimer.current) clearTimeout(hintTimer.current);
    },
    [],
  );

  /** A screen point as a point in SVG space, for the box given. */
  const toSvgPoint = useCallback(
    (clientX: number, clientY: number, b: CameraBox): Point => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
      return clientToSvgPoint(rect, b, clientX, clientY);
    },
    [svgRef],
  );

  const zoomBy = useCallback(
    (factor: number, focus: Point | null, animate: boolean) => {
      const b = getBase();
      const at = focus ?? { x: b.x + b.w / 2, y: b.y + b.h / 2 };
      const next = zoomAt(b, factor, at, undefined, limits);
      if (
        Math.abs(next.w - b.w) < 1e-6 &&
        Math.abs(next.x - b.x) < 1e-6 &&
        Math.abs(next.y - b.y) < 1e-6
      ) {
        return; // already at a limit
      }
      setView(next, animate);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getBase, setView, maxZoom],
  );

  // Wheel and multi-touch need NON-passive native listeners so the browser's
  // own page zoom / scroll can be suppressed -- but only when we use the
  // gesture. A plain wheel and one-finger touches are left alone entirely.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey)) {
        showHint(isMac() ? "wheelMac" : "wheel");
        return;
      }
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : 1;
      const factor = Math.exp(
        Math.max(-60, Math.min(60, -event.deltaY * unit)) * 0.01,
      );
      zoomBy(
        factor,
        toSvgPoint(event.clientX, event.clientY, getBase()),
        false,
      );
    };
    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length >= 2 && event.cancelable) event.preventDefault();
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    svg.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      svg.removeEventListener("wheel", onWheel);
      svg.removeEventListener("touchmove", onTouchMove);
    };
  }, [svgRef, rebindKey, showHint, zoomBy, toSvgPoint, getBase]);

  function onPointerEnd(event: ReactPointerEvent<SVGSVGElement>) {
    const g = gesture.current;
    const info = g.pointers.get(event.pointerId);
    g.pointers.delete(event.pointerId);
    if (g.pinch && g.pointers.size < 2) g.pinch = null;
    if (g.drag?.id === event.pointerId) {
      if (g.dragging) {
        try {
          event.currentTarget.releasePointerCapture?.(event.pointerId);
        } catch {}
        event.currentTarget.style.cursor = "";
      }
      g.drag = null;
      g.dragging = false;
    }
    const tap = g.touch;
    g.touch = null;
    // Double-tap (touch): two quick taps close together zoom in on the point.
    if (
      doubleZoom &&
      event.type === "pointerup" &&
      info?.type === "touch" &&
      tap &&
      !tap.hinted &&
      Math.hypot(event.clientX - tap.x, event.clientY - tap.y) < SWIPE_SLOP &&
      !(event.target as Element).closest?.("[role='button']")
    ) {
      const prev = g.lastTap;
      const now = event.timeStamp;
      if (
        now - prev.t < 320 &&
        Math.hypot(event.clientX - prev.x, event.clientY - prev.y) < 30
      ) {
        g.lastTap = { t: 0, x: 0, y: 0 };
        zoomBy(
          DOUBLE_ZOOM,
          toSvgPoint(event.clientX, event.clientY, getBase()),
          true,
        );
      } else {
        g.lastTap = { t: now, x: event.clientX, y: event.clientY };
      }
    }
  }

  function onPointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    const g = gesture.current;
    g.lastType = event.pointerType;
    if (g.pointers.size === 0) g.moved = false;
    g.pointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      type: event.pointerType,
    });
    if (g.pointers.size === 2) {
      const [a, b] = Array.from(g.pointers.values());
      g.pinch = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        mx: (a.x + b.x) / 2,
        my: (a.y + b.y) / 2,
      };
      g.drag = null;
      g.dragging = false;
      g.touch = null;
      g.moved = true;
    } else if (g.pointers.size === 1) {
      if (event.pointerType === "touch") {
        g.touch = { x: event.clientX, y: event.clientY, hinted: false };
      } else if (event.button === 0) {
        g.drag = {
          id: event.pointerId,
          sx: event.clientX,
          sy: event.clientY,
          lx: event.clientX,
          ly: event.clientY,
        };
      }
    }
  }

  function onPointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const g = gesture.current;
    const p = g.pointers.get(event.pointerId);
    if (!p) return;
    p.x = event.clientX;
    p.y = event.clientY;
    const rect = event.currentTarget.getBoundingClientRect();

    if (g.pinch && g.pointers.size >= 2) {
      const [a, b] = Array.from(g.pointers.values());
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const base = getBase();
      const zoomed =
        g.pinch.dist > 0 && dist > 0
          ? zoomAt(
              base,
              dist / g.pinch.dist,
              toSvgPoint(g.pinch.mx, g.pinch.my, base),
              undefined,
              limits,
            )
          : base;
      const fit = screenFit(rect, zoomed);
      const moved =
        rect.width > 0 && rect.height > 0
          ? panBy(
              zoomed,
              -(mx - g.pinch.mx) / fit.scale,
              -(my - g.pinch.my) / fit.scale,
            )
          : zoomed;
      g.pinch = { dist, mx, my };
      g.moved = true;
      setView(moved, false);
      return;
    }

    const drag = g.drag;
    if (drag && drag.id === event.pointerId) {
      if (
        !g.dragging &&
        Math.hypot(event.clientX - drag.sx, event.clientY - drag.sy) > DRAG_SLOP
      ) {
        // Capture only once it is a real drag, so a plain click still reaches
        // the pin underneath.
        g.dragging = true;
        g.moved = true;
        try {
          event.currentTarget.setPointerCapture?.(event.pointerId);
        } catch {}
        event.currentTarget.style.cursor = "grabbing";
      }
      if (g.dragging && rect.width > 0 && rect.height > 0) {
        const base = getBase();
        const { scale } = screenFit(rect, base);
        setView(
          panBy(
            base,
            -(event.clientX - drag.lx) / scale,
            -(event.clientY - drag.ly) / scale,
          ),
          false,
        );
      }
      drag.lx = event.clientX;
      drag.ly = event.clientY;
      return;
    }

    // One finger: the browser scrolls the page (touch-action: pan-y). Tell
    // the reader how to move the map instead.
    const touch = g.touch;
    if (
      touch &&
      !touch.hinted &&
      p.type === "touch" &&
      Math.hypot(event.clientX - touch.x, event.clientY - touch.y) > SWIPE_SLOP
    ) {
      touch.hinted = true;
      g.moved = true;
      showHint("touch");
    }
  }

  function onDoubleClick(event: ReactMouseEvent<SVGSVGElement>) {
    if (!doubleZoom) return;
    // Touch double-taps are handled on pointerup; don't zoom twice.
    if (gesture.current.lastType === "touch") return;
    if ((event.target as Element).closest?.("[role='button']")) return;
    zoomBy(
      DOUBLE_ZOOM,
      toSvgPoint(event.clientX, event.clientY, getBase()),
      true,
    );
  }

  function onKeyDown(event: ReactKeyboardEvent<SVGSVGElement>) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const b = getBase();
    const dx = b.w * KEY_PAN;
    const dy = b.h * KEY_PAN;
    switch (event.key) {
      case "ArrowLeft":
        setView(panBy(b, -dx, 0), true);
        break;
      case "ArrowRight":
        setView(panBy(b, dx, 0), true);
        break;
      case "ArrowUp":
        setView(panBy(b, 0, -dy), true);
        break;
      case "ArrowDown":
        setView(panBy(b, 0, dy), true);
        break;
      case "+":
      case "=":
        zoomBy(BUTTON_ZOOM, null, true);
        break;
      case "-":
      case "_":
        zoomBy(1 / BUTTON_ZOOM, null, true);
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  return {
    hint,
    zoomBy,
    toSvgPoint,
    /** True when the press that just ended dragged, pinched or swiped: its click is not a tap. */
    wasGesture: () => gesture.current.moved,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
      onDoubleClick,
      onKeyDown,
    },
  };
}
