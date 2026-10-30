"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  JOURNEY_VIEWBOX,
  cookStraitLegs,
  latLngToPoint,
  type Point,
} from "@/lib/journey/geo";
import {
  FULL_BOX,
  cameraBoxFor,
  cameraBoxForPoints,
  type CameraBox,
} from "@/lib/journey/camera";
import {
  catmullRomSegments,
  segmentToPath,
  type BezierSegment,
} from "@/lib/journey/path";
import { spreadPins } from "@/lib/journey/pins";
import type { JourneyStopView } from "@/lib/journey/schema";
import { JourneyBackdrop } from "@/components/story/journey-backdrop";
import { JourneyCities } from "@/components/story/journey-cities";
import {
  BUTTON_ZOOM,
  useMapGestures,
} from "@/components/story/use-map-gestures";
import { applyMapDetail, boxAttr, fmt } from "@/components/story/map-detail";
import {
  CONTROL_BUTTON,
  RecentreIcon,
  ZoomIcon,
} from "@/components/story/map-control-icons";
import { Campervan, Ferry } from "@/components/story/journey-vehicles";

/**
 * The reader-facing "story journey" picture: a stylised illustration
 * of New Zealand with the contributor's route drawn on it and a
 * cartoon campervan (a ferry across Cook Strait) that drives from stop to
 * stop, pausing at each one to show a card that links to the contributor's
 * story for that place (one pin per published New Zealand story).
 *
 * It is a picture, not a map: no tiles, no geolocation, no routing. Readers
 * may zoom and pan the picture (buttons, wheel with Ctrl/Cmd, pinch, drag,
 * keyboard); that switches the camera from "auto" (follows the van) to
 * "manual" until they re-centre or pick a stop. It only
 * ever receives labels and ~1 km-rounded positions of publicly visible
 * stories (see lib/journey/contributor-journey.ts); coordinates are never
 * printed. A single pin is fine: no route and no van, just the place.
 *
 * Accessibility: an ordered text list of the stops is ALWAYS rendered and is
 * the real content; the SVG is a labelled image whose pins are keyboard
 * focusable shortcuts. With prefers-reduced-motion the route is static and
 * nothing drives. A play/pause button is always offered when it animates.
 *
 * ONE-LEVEL HIERARCHY. The overview shows only MAIN stops (the route the van
 * drives). A main stop that has sub-stops ("places inside") can be OPENED:
 * the drive pauses with the van parked there, the camera frames the main
 * stop and its sub-stops, which appear as smaller lettered pins (4a, 4b...)
 * joined by a dotted line, and the timeline lists them nested under it.
 * "Back to whole journey" (or Escape) closes it and the drive can resume.
 */

const DWELL_MS = 2600;
/** Largest single-frame time step; real elapsed time is used up to this. */
const MAX_FRAME_MS = 500;
const MIN_DRIVE_MS = 1600;
const MAX_DRIVE_MS = 5000;
/**
 * Stops closer than this (SVG units) are nudged apart for display only. The
 * markers are small dots and the camera zooms in on crowded legs, so this is
 * far smaller than the old numbered-pin spacing.
 */
const PIN_MIN_DISTANCE = 6;
/** Radius (SVG units, at full view) the strait pull keeps clear of the water. */
const PIN_LAYOUT_RADIUS = 6;
/** Camera follow: exponential ease; ~4 time constants to settle (~0.9 s). */
const CAMERA_TAU_MS = 230;
/** Marker sizes, in full-view SVG units; divided by the zoom while zoomed. */
const DOT_R = 2.4;
const DOT_R_LIT = 3.4;
/**
 * Invisible tap radius. A pin-space unit is a constant ~1.7 screen px on a
 * phone-width map (the pins are scaled by 1/zoom), so 13 units is a ~44px
 * target around a dot that stays 2.4 units across.
 */
const HIT_R = 13;
const BIG_PIN_R = 5.6;
const CHIP_FONT = 5;
const CHIP_H = 9;
const CHIP_GAP = 7.5;
const CHIP_MAX_CHARS = 24;
/** Sub-stop pins: smaller than a main stop's pin, spread within their group. */
const SUB_R = 3.7;
const SUB_FONT = 3.5;
const SUB_HIT_R = 12;
const SUB_MIN_DISTANCE = 4.5;
const SUB_LAYOUT_RADIUS = 4;
/** Room around an opened group, and how far in the camera may go for it. */
const GROUP_MARGIN = 14;
const GROUP_MAX_ZOOM = 6;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false,
  );
}

function bezierPoint(seg: BezierSegment, t: number): Point {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * seg.from.x + b * seg.c1.x + c * seg.c2.x + d * seg.to.x,
    y: a * seg.from.y + b * seg.c1.y + c * seg.c2.y + d * seg.to.y,
  };
}

function approxLength(seg: BezierSegment): number {
  let length = 0;
  let prev = seg.from;
  for (let i = 1; i <= 12; i += 1) {
    const next = bezierPoint(seg, i / 12);
    length += Math.hypot(next.x - prev.x, next.y - prev.y);
    prev = next;
  }
  return length;
}

const easeInOut = (p: number) => p * p * (3 - 2 * p);

/** Rough text width in chip units (CJK glyphs are about twice as wide). */
function chipWidth(text: string): number {
  let w = 6;
  for (const ch of text) w += (ch.codePointAt(0) ?? 0) > 0x2e7f ? 5.2 : 2.8;
  return w;
}

function chipText(label: string): string {
  const chars = Array.from(label);
  return chars.length > CHIP_MAX_CHARS
    ? `${chars.slice(0, CHIP_MAX_CHARS - 1).join("")}…`
    : label;
}

/**
 * Where the name chip goes next to a pin so it stays inside the visible box:
 * to the right unless that would poke out, then to the left; nudged up/down
 * if it would cross the top/bottom. Offsets are in marker units (the marker
 * group is drawn at 1/zoom).
 */
function chipPlacement(p: Point, width: number, box: CameraBox) {
  const s = box.w / JOURNEY_VIEWBOX.width;
  const roomRight = box.x + box.w - s - p.x - CHIP_GAP * s;
  const roomLeft = p.x - CHIP_GAP * s - (box.x + s);
  const right = width * s <= roomRight || roomRight >= roomLeft;
  const lo = (box.y + s - p.y) / s;
  const hi = (box.y + box.h - s - p.y) / s - CHIP_H;
  const dy = Math.max(lo, Math.min(hi, -CHIP_H / 2));
  return { x: right ? CHIP_GAP : -CHIP_GAP - width, y: Math.max(lo, dy) };
}

type Travel = { to: number; ferry: boolean };

type SubStop = { stop: JourneyStopView; id: string };

/**
 * Splits the flat list into MAIN stops and, per main stop, its sub-stops
 * (labelled "4a", "4b"... after the main stop's number). Anything whose
 * parentIndex does not point at an earlier main stop is ignored, so a
 * malformed list can never break the map.
 */
function groupStops(all: readonly JourneyStopView[]) {
  const mains: JourneyStopView[] = [];
  const subs: SubStop[][] = [];
  const ordinalOf = new Map<number, number>();
  all.forEach((stop, index) => {
    const parent = stop.parentIndex;
    if (parent === null || parent === undefined) {
      ordinalOf.set(index, mains.length);
      mains.push(stop);
      subs.push([]);
      return;
    }
    const ordinal = parent < index ? ordinalOf.get(parent) : undefined;
    if (ordinal === undefined) return;
    const list = subs[ordinal];
    list.push({
      stop,
      id: `${ordinal + 1}${String.fromCharCode(97 + list.length)}`,
    });
  });
  return { mains, subs };
}

/** Small "+3 places" badge drawn beside a main stop's pin (marker units). */
function CountBadge({ n, x, y }: { n: number; x: number; y: number }) {
  const text = `+${n}`;
  const w = 3.2 + text.length * 2.4;
  return (
    <g aria-hidden="true" data-testid="journey-sub-badge" pointerEvents="none">
      <rect
        x={x}
        y={y - 3.3}
        width={w}
        height={6.6}
        rx={3.3}
        fill="#2b6cb0"
        stroke="#ffffff"
        strokeWidth="0.8"
      />
      <text
        x={x + w / 2}
        y={y}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="4"
        fontWeight="700"
        fill="#ffffff"
      >
        {text}
      </text>
    </g>
  );
}

export function JourneyMap({ stops: allStops }: { stops: JourneyStopView[] }) {
  const t = useTranslations("journey");
  const headingId = useId();
  const helpId = useId();
  const reducedMotion = usePrefersReducedMotion();

  // Only MAIN stops make up the route; sub-stops show when one is opened.
  const grouped = useMemo(() => groupStops(allStops), [allStops]);
  const stops = grouped.mains;
  const subsByMain = grouped.subs;

  const count = stops.length;
  // Display positions only: nudged so overlapping pins stay legible. The
  // stops' stored coordinates are never changed.
  const points = useMemo(
    () =>
      spreadPins(
        stops.map(latLngToPoint),
        PIN_MIN_DISTANCE,
        JOURNEY_VIEWBOX,
        PIN_LAYOUT_RADIUS,
      ),
    [stops],
  );
  const segments = useMemo(() => catmullRomSegments(points), [points]);
  const legPaths = useMemo(() => segments.map(segmentToPath), [segments]);
  const ferryLegs = useMemo(() => cookStraitLegs(stops), [stops]);
  const driveDurations = useMemo(
    () =>
      segments.map((s) =>
        Math.min(
          MAX_DRIVE_MS,
          Math.max(MIN_DRIVE_MS, 900 + approxLength(s) * 28),
        ),
      ),
    [segments],
  );

  const legRefs = useRef<Array<SVGPathElement | null>>([]);
  const vehicleRef = useRef<SVGGElement | null>(null);
  const pointsRef = useRef(points);
  useLayoutEffect(() => {
    pointsRef.current = points;
  }, [points]);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const routeRef = useRef<SVGGElement | null>(null);
  // Camera: where the viewBox is now and where it is easing to. Written to
  // the DOM straight from the animation frame (no React render per frame).
  const cam = useRef<CameraBox>({ ...FULL_BOX });
  const camTarget = useRef<CameraBox>({ ...FULL_BOX });
  const pose = useRef<{ x: number; y: number; flip: boolean; angle: number }>(
    null,
  );
  const ensureLoop = useRef<() => void>(() => {});
  // Timeline: the filled part of each connector line (0..1 of the leg) and
  // the little vehicle riding it. Updated straight from the animation frame
  // (no React re-render per frame).
  const fillRefs = useRef<Array<HTMLDivElement | null>>([]);
  const iconRefs = useRef<Array<HTMLDivElement | null>>([]);
  const listRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLLIElement | null>>([]);
  const anim = useRef({
    leg: 0,
    phase: "dwell" as "dwell" | "drive",
    elapsed: 0,
  });

  const [playing, setPlaying] = useState(true);
  const [finished, setFinished] = useState(false);
  const [activeStop, setActiveStop] = useState<number | null>(0);
  const [travel, setTravel] = useState<Travel | null>(null);
  const [highlight, setHighlight] = useState<number | null>(null);
  // The opened main stop (index into the main stops), and the sub-stop
  // (index within it) that is hovered/focused or was chosen.
  const [openMain, setOpenMain] = useState<number | null>(null);
  const [activeSub, setActiveSub] = useState<number | null>(null);
  const [highlightSub, setHighlightSub] = useState<number | null>(null);
  const resumeRef = useRef(false);
  const triggerRef = useRef<Element | null>(null);
  const backRef = useRef<HTMLButtonElement | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);
  // Camera mode: "auto" follows the van; any reader zoom/pan makes it manual.
  // The ref mirrors the state so gesture handlers never read a stale mode.
  const [manual, setManual] = useState(false);
  const manualRef = useRef(false);
  const syncFills = useCallback(
    (leg: number, progress: number) => {
      for (let i = 0; i < count - 1; i += 1) {
        const fill = fillRefs.current[i];
        if (!fill) continue;
        const v = i < leg ? 1 : i === leg ? progress : 0;
        fill.style.transform = `scaleY(${Math.round(v * 1000) / 1000})`;
      }
      const icon = iconRefs.current[leg];
      if (icon) icon.style.top = `${(progress * 100).toFixed(2)}%`;
    },
    [count],
  );

  /**
   * Draw the vehicle at its last pose, at 1/zoom so it keeps a constant
   * on-screen size while the camera is zoomed in.
   */
  const writeVehicle = useCallback(() => {
    const el = vehicleRef.current;
    const at = pose.current;
    if (!el || !at) return;
    const k = cam.current.w / JOURNEY_VIEWBOX.width;
    el.setAttribute(
      "transform",
      `translate(${at.x.toFixed(2)} ${at.y.toFixed(2)}) scale(${fmt(at.flip ? -k : k)} ${fmt(k)}) rotate(${at.angle.toFixed(1)})`,
    );
  }, []);

  /**
   * Push the camera to the DOM: the viewBox, plus every marker, the route's
   * dashes and the vehicle at 1/zoom so they stay a constant on-screen size.
   */
  const applyCamera = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const c = cam.current;
    const k = fmt(c.w / JOURNEY_VIEWBOX.width);
    svg.setAttribute("viewBox", boxAttr(c));
    svg.querySelectorAll<SVGGElement>("[data-pin]").forEach((g) => {
      g.setAttribute(
        "transform",
        `translate(${g.dataset.px} ${g.dataset.py}) scale(${k})`,
      );
    });
    const route = routeRef.current;
    if (route) {
      route.setAttribute("stroke-width", String(fmt(2 * k)));
      route.setAttribute("stroke-dasharray", `${fmt(k)} ${fmt(5 * k)}`);
    }
    svg.querySelectorAll<SVGElement>("[data-subroute]").forEach((el) => {
      el.setAttribute("stroke-width", String(fmt(1.2 * k)));
      el.setAttribute("stroke-dasharray", `${fmt(0.7 * k)} ${fmt(3 * k)}`);
    });
    writeVehicle();
    applyMapDetail(svg, k, pointsRef.current);
  }, [writeVehicle]);

  const place = useCallback(
    (leg: number, progress: number) => {
      const seg = segments[leg];
      if (!seg || !vehicleRef.current) return;
      const path = legRefs.current[leg];
      let here: Point;
      let ahead: Point;
      let behind: Point;
      if (path && typeof path.getTotalLength === "function") {
        const length = path.getTotalLength();
        const s = length * progress;
        here = path.getPointAtLength(s);
        ahead = path.getPointAtLength(Math.min(length, s + 1));
        behind = path.getPointAtLength(Math.max(0, s - 1));
      } else {
        // No layout engine (tests, very old browsers): same curve, computed.
        here = bezierPoint(seg, progress);
        ahead = bezierPoint(seg, Math.min(1, progress + 0.02));
        behind = bezierPoint(seg, Math.max(0, progress - 0.02));
      }
      const dx = ahead.x - behind.x;
      const dy = ahead.y - behind.y;
      const flip = dx < 0;
      const raw = (Math.atan2(dy, flip ? -dx : dx) * 180) / Math.PI;
      // Keep the vehicle upright-ish: it leans into hills, it does not roll.
      const angle = Math.max(-28, Math.min(28, raw));
      pose.current = { x: here.x, y: here.y, flip, angle };
      writeVehicle();
    },
    [segments, writeVehicle],
  );

  const placeAtStop = useCallback(
    (index: number) => {
      if (count < 2) return;
      if (index >= count - 1) place(count - 2, 1);
      else place(index, 0);
    },
    [count, place],
  );

  const showVehicle = !reducedMotion && count >= 2;

  // Park the vehicle at the first stop once it exists in the DOM.
  useEffect(() => {
    placeAtStop(0);
  }, [placeAtStop, showVehicle]);

  const moving = playing && !reducedMotion && count >= 2;
  const animated = !reducedMotion && count >= 2;

  // One animation loop drives both the van (while playing) and the camera
  // (while it is still easing towards its target, e.g. after a click on a
  // pin while paused). It stops itself when there is nothing left to move.
  useEffect(() => {
    if (!animated) return;
    let raf = 0;
    let running = false;
    let last = performance.now();

    const settled = () => {
      const c = cam.current;
      const t = camTarget.current;
      return (
        Math.abs(c.x - t.x) < 0.02 &&
        Math.abs(c.y - t.y) < 0.02 &&
        Math.abs(c.w - t.w) < 0.02 &&
        Math.abs(c.h - t.h) < 0.02
      );
    };

    const stepCamera = (dt: number) => {
      const c = cam.current;
      const t = camTarget.current;
      if (settled()) {
        cam.current = { ...t };
      } else {
        const k = 1 - Math.exp(-dt / CAMERA_TAU_MS);
        c.x += (t.x - c.x) * k;
        c.y += (t.y - c.y) * k;
        c.w += (t.w - c.w) * k;
        c.h += (t.h - c.h) * k;
      }
      applyCamera();
    };

    // Time spent hidden is skipped: restart the clock when the tab returns.
    const onVisibility = () => {
      if (document.visibilityState === "visible") last = performance.now();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const tick = (now: number) => {
      const a = anim.current;
      if (document.visibilityState === "hidden") {
        last = now;
        raf = requestAnimationFrame(tick);
        return;
      }
      // Use real elapsed time so a slow device still finishes on schedule;
      // the generous cap only guards against a freeze/stall teleporting the van.
      const dt = Math.min(Math.max(now - last, 0), MAX_FRAME_MS);
      last = now;
      let keepGoing = moving;

      if (moving) {
        a.elapsed += dt;
        if (a.phase === "dwell") {
          if (a.elapsed >= DWELL_MS) {
            if (a.leg >= count - 1) {
              setPlaying(false);
              setFinished(true);
              keepGoing = false;
            } else {
              a.phase = "drive";
              a.elapsed = 0;
              setActiveStop(null);
              setTravel({ to: a.leg + 1, ferry: ferryLegs[a.leg] ?? false });
            }
          }
        } else {
          const progress = Math.min(1, a.elapsed / driveDurations[a.leg]);
          const eased = easeInOut(progress);
          place(a.leg, eased);
          syncFills(a.leg, eased);
          if (progress >= 1) {
            a.leg += 1;
            a.phase = "dwell";
            a.elapsed = 0;
            setTravel(null);
            setActiveStop(a.leg);
          }
        }
      }

      stepCamera(dt);
      if (keepGoing || !settled()) {
        raf = requestAnimationFrame(tick);
      } else {
        running = false;
      }
    };

    const ensure = () => {
      if (running) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };
    ensureLoop.current = ensure;
    ensure();

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
      ensureLoop.current = () => {};
    };
  }, [
    animated,
    moving,
    count,
    ferryLegs,
    driveDurations,
    place,
    syncFills,
    applyCamera,
  ]);

  // Whenever the vehicle is parked at a stop (including the very first
  // render, replay, a click on a pin/item, and reduced motion) the timeline
  // shows every leg before it filled and none after.
  useEffect(() => {
    if (activeStop !== null) syncFills(activeStop, 0);
  }, [activeStop, syncFills]);

  const current = travel ? travel.to : (activeStop ?? 0);

  // Camera follow (automatic only; readers cannot zoom or pan): frame the
  // current leg -- the same box while dwelling at stop i and driving i -> i+1
  // so the camera does not lurch at departure -- and pull back to the whole
  // of New Zealand when the journey ends or with reduced motion.
  const camLeg = Math.max(
    0,
    Math.min(travel ? travel.to - 1 : (activeStop ?? 0), count - 2),
  );

  // Sub-stop display positions for the opened group: spread within the group
  // only, then shifted so the main stop stays exactly where the overview put
  // it.
  const subPoints = useMemo(() => {
    if (openMain === null) return [] as Point[];
    const subs = subsByMain[openMain] ?? [];
    if (subs.length === 0) return [] as Point[];
    const main = latLngToPoint(stops[openMain]);
    const spread = spreadPins(
      [main, ...subs.map((sub) => latLngToPoint(sub.stop))],
      SUB_MIN_DISTANCE,
      JOURNEY_VIEWBOX,
      SUB_LAYOUT_RADIUS,
    );
    const dx = points[openMain].x - spread[0].x;
    const dy = points[openMain].y - spread[0].y;
    return spread.slice(1).map((p) => ({ x: p.x + dx, y: p.y + dy }));
  }, [openMain, subsByMain, stops, points]);

  const box = useMemo(() => {
    if (openMain !== null && subPoints.length > 0) {
      return cameraBoxForPoints([points[openMain], ...subPoints], {
        margin: GROUP_MARGIN,
        maxZoom: GROUP_MAX_ZOOM,
      });
    }
    return reducedMotion || finished || count < 2
      ? FULL_BOX
      : cameraBoxFor(points, camLeg);
  }, [openMain, subPoints, reducedMotion, finished, count, points, camLeg]);

  useEffect(() => {
    // In manual mode the reader owns the camera; the van keeps driving.
    if (manual) return;
    camTarget.current = box;
    if (reducedMotion) {
      cam.current = { ...box };
      applyCamera();
    } else {
      ensureLoop.current();
    }
  }, [box, manual, reducedMotion, applyCamera]);

  /** Hand the camera back to the automatic follow (eases to its target). */
  const followVan = useCallback(() => {
    manualRef.current = false;
    setManual(false);
  }, []);

  /**
   * Reader-driven view change. Goes through the same ref-based applyCamera
   * path as the automatic camera (no React render per gesture frame); only the
   * first change flips the mode state. Instant when `animate` is false or
   * with reduced motion.
   */
  const setView = useCallback(
    (next: CameraBox, animate: boolean) => {
      if (!manualRef.current) {
        manualRef.current = true;
        setManual(true);
      }
      camTarget.current = next;
      if (animate && !reducedMotion) {
        ensureLoop.current();
      } else {
        cam.current = { ...next };
        applyCamera();
      }
    },
    [reducedMotion, applyCamera],
  );

  const baseBox = useCallback(
    (): CameraBox => (manualRef.current ? camTarget.current : cam.current),
    [],
  );

  const gestures = useMapGestures({
    svgRef,
    getBase: baseBox,
    setView,
    rebindKey: count,
  });
  const { hint, zoomBy } = gestures;

  // React may have just re-rendered markers at their base transform: put the
  // current camera's scaling back before the browser paints.
  useLayoutEffect(() => {
    applyCamera();
  });

  // Keep the current item visible inside the timeline's own scroll box. This
  // adjusts that box's scrollTop only -- scrollIntoView would also scroll the
  // page, which must never happen.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const box = listRef.current;
    const item = itemRefs.current[current];
    if (!box || !item || box.scrollHeight <= box.clientHeight) return;
    const top = item.offsetTop;
    const bottom = top + item.offsetHeight;
    if (top < box.scrollTop) box.scrollTop = top;
    else if (bottom > box.scrollTop + box.clientHeight) {
      box.scrollTop = bottom - box.clientHeight;
    }
  }, [current]);

  function showStop(index: number) {
    followVan();
    setPlaying(false);
    setFinished(false);
    setTravel(null);
    setActiveStop(index);
    anim.current = {
      leg: Math.min(index, Math.max(0, count - 1)),
      phase: "dwell",
      elapsed: 0,
    };
    placeAtStop(index);
  }

  /** Open a main stop's sub-stops: park the van there and frame the group. */
  function openGroup(index: number, trigger: Element | null) {
    if (openMain === null) resumeRef.current = playing && !finished;
    triggerRef.current = trigger;
    showStop(index);
    setOpenMain(index);
    setActiveSub(null);
    setHighlightSub(null);
  }

  /**
   * Close the opened group: sub-stops hide, the camera returns to following
   * the van and, if the drive was running when it was opened, it resumes from
   * that stop.
   */
  const closeGroup = useCallback(
    (options: { resume: boolean; refocus: boolean }) => {
      if (openMain === null) return;
      setOpenMain(null);
      setActiveSub(null);
      setHighlightSub(null);
      followVan();
      if (options.resume && resumeRef.current) setPlaying(true);
      resumeRef.current = false;
      if (options.refocus) {
        const trigger = triggerRef.current;
        if (trigger instanceof HTMLElement || trigger instanceof SVGElement) {
          trigger.focus({ preventScroll: true });
        }
      }
    },
    [openMain, followVan],
  );

  /** A main stop was chosen (pin, dot or timeline row). */
  function chooseMain(index: number, trigger: Element | null) {
    if ((subsByMain[index]?.length ?? 0) > 0) {
      if (openMain === index) {
        closeGroup({ resume: true, refocus: false });
      } else {
        openGroup(index, trigger);
      }
      return;
    }
    if (openMain !== null) closeGroup({ resume: false, refocus: false });
    showStop(index);
  }

  // Escape closes the opened group (scoped to this map's section).
  useEffect(() => {
    const el = sectionRef.current;
    if (!el || openMain === null) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeGroup({ resume: true, refocus: true });
      }
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [openMain, closeGroup]);

  // Focus moves to "Back to whole journey" when a group opens.
  useEffect(() => {
    if (openMain !== null) backRef.current?.focus({ preventScroll: true });
  }, [openMain]);

  function togglePlay() {
    if (openMain !== null) closeGroup({ resume: false, refocus: false });
    if (finished) {
      followVan();
      anim.current = { leg: 0, phase: "dwell", elapsed: 0 };
      setFinished(false);
      setTravel(null);
      setActiveStop(0);
      placeAtStop(0);
      setPlaying(true);
      return;
    }
    if (playing) {
      // Pausing while mid-drive keeps the van where it is; resuming carries on.
      setPlaying(false);
      return;
    }
    setPlaying(true);
  }

  if (count < 1) return null;

  const statusText =
    openMain !== null
      ? t("insideStatus", {
          label: stops[openMain].label,
          count: subsByMain[openMain].length,
        })
      : travel
        ? t(travel.ferry ? "onTheFerry" : "onTheRoad", {
            label: stops[travel.to].label,
          })
        : count === 1
          ? t("singlePlace")
          : t("stopOf", { n: current + 1, total: count });

  return (
    <section
      ref={sectionRef}
      aria-labelledby={headingId}
      className="mt-10 rounded-2xl border border-border-subtle p-4 sm:p-6 md:relative md:left-1/2 md:w-[min(72rem,calc(100vw-4rem))] md:-translate-x-1/2"
    >
      <h2
        id={headingId}
        className="text-xl font-semibold tracking-tight sm:text-2xl"
      >
        {t("title")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("note")}</p>

      <div className="mt-4 grid gap-6 md:grid-cols-[auto_minmax(0,1fr)] md:items-start md:gap-8">
        <div className="relative mx-auto w-full md:mx-0 md:w-fit md:max-w-full">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${JOURNEY_VIEWBOX.width} ${JOURNEY_VIEWBOX.height}`}
            role="group"
            aria-label={t("mapLabel", { count })}
            aria-describedby={helpId}
            tabIndex={0}
            // One finger must keep scrolling the page; two-finger pinch/drag is
            // handled here (and kept from scrolling by a native touchmove).
            style={{ touchAction: "pan-y" }}
            {...gestures.handlers}
            className="block h-auto w-full cursor-grab select-none rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:h-[clamp(30rem,78vh,40rem)] md:w-auto md:max-w-full"
          >
            <JourneyBackdrop />
            <JourneyCities />
            <g
              ref={routeRef}
              fill="none"
              stroke="#ef8a9a"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray="1 5"
              aria-hidden="true"
            >
              {legPaths.map((d, i) => (
                <path
                  key={i}
                  ref={(el) => {
                    legRefs.current[i] = el;
                  }}
                  d={d}
                  data-ferry={ferryLegs[i] ? "true" : undefined}
                />
              ))}
            </g>

            {/* Small dots: the keyboard/touch targets for every stop. Each is
              drawn at 1/zoom (see applyCamera) so it keeps its on-screen size. */}
            {stops.map((stop, i) => {
              const p = points[i];
              const lit = highlight === i;
              const visited = i < current;
              const subCount = subsByMain[i].length;
              return (
                <g
                  key={i}
                  role="button"
                  tabIndex={0}
                  aria-label={
                    subCount > 0
                      ? t("pinLabelWithSubs", {
                          n: i + 1,
                          label: stop.label,
                          count: subCount,
                        })
                      : t("pinLabel", { n: i + 1, label: stop.label })
                  }
                  aria-pressed={subCount > 0 ? undefined : activeStop === i}
                  aria-expanded={subCount > 0 ? openMain === i : undefined}
                  onClick={(event) => chooseMain(i, event.currentTarget)}
                  onMouseEnter={() => setHighlight(i)}
                  onMouseLeave={() => setHighlight(null)}
                  onFocus={() => setHighlight(i)}
                  onBlur={() => setHighlight(null)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      chooseMain(i, event.currentTarget);
                    }
                  }}
                  className="group cursor-pointer outline-none"
                >
                  <g
                    data-pin=""
                    data-px={p.x.toFixed(2)}
                    data-py={p.y.toFixed(2)}
                    transform={`translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})`}
                  >
                    {/* Invisible, enlarged hit area (>= 44px on a phone). */}
                    <circle r={HIT_R} fill="transparent" />
                    <circle
                      r={BIG_PIN_R + 2}
                      fill="none"
                      stroke="#2b6cb0"
                      strokeWidth="1.4"
                      className="opacity-0 group-focus-visible:opacity-100"
                    />
                    {i === current ? null : (
                      <circle
                        data-testid="journey-dot"
                        data-state={visited ? "visited" : "upcoming"}
                        r={lit ? DOT_R_LIT : DOT_R}
                        fill={visited ? "#2f9e8f" : "#b4bec6"}
                        stroke={lit ? "#2b6cb0" : "#ffffff"}
                        strokeWidth="1"
                      />
                    )}
                    {subCount > 0 && i !== current ? (
                      <CountBadge n={subCount} x={2.6} y={-3.6} />
                    ) : null}
                  </g>
                </g>
              );
            })}

            {/* The opened main stop's sub-stops: smaller lettered pins on a
              dotted line main -> a -> b. Drawn above the main dots. */}
            {openMain !== null && subPoints.length > 0 ? (
              <g data-testid="journey-substops">
                <path
                  data-subroute=""
                  d={`M${[points[openMain], ...subPoints]
                    .map((p) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
                    .join(" L")}`}
                  fill="none"
                  stroke="#2b6cb0"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray="0.7 3"
                  pointerEvents="none"
                  aria-hidden="true"
                />
                {subsByMain[openMain].map((sub, si) => {
                  const p = subPoints[si];
                  if (!p) return null;
                  const chosen = activeSub === si || highlightSub === si;
                  return (
                    <g
                      key={si}
                      role="button"
                      tabIndex={0}
                      aria-label={t("subPinLabel", {
                        id: sub.id,
                        label: sub.stop.label,
                      })}
                      aria-pressed={activeSub === si}
                      onClick={() => setActiveSub(activeSub === si ? null : si)}
                      onMouseEnter={() => setHighlightSub(si)}
                      onMouseLeave={() => setHighlightSub(null)}
                      onFocus={() => setHighlightSub(si)}
                      onBlur={() => setHighlightSub(null)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setActiveSub(activeSub === si ? null : si);
                        }
                      }}
                      className="group cursor-pointer outline-none"
                    >
                      <g
                        data-pin=""
                        data-px={p.x.toFixed(2)}
                        data-py={p.y.toFixed(2)}
                        transform={`translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})`}
                      >
                        <circle r={SUB_HIT_R} fill="transparent" />
                        <circle
                          r={SUB_R + 1.6}
                          fill="none"
                          stroke="#2b6cb0"
                          strokeWidth="1.2"
                          className="opacity-0 group-focus-visible:opacity-100"
                        />
                        <circle
                          data-testid="journey-sub-pin"
                          r={chosen ? SUB_R + 0.6 : SUB_R}
                          fill="var(--map-label-halo)"
                          stroke="#2b6cb0"
                          strokeWidth="1"
                        />
                        <text
                          aria-hidden="true"
                          textAnchor="middle"
                          dominantBaseline="central"
                          fontSize={SUB_FONT}
                          fontWeight="700"
                          style={{ fill: "var(--map-label)" }}
                        >
                          {sub.id}
                        </text>
                      </g>
                    </g>
                  );
                })}
              </g>
            ) : null}

            {/* The current stop's big numbered pin and name chip, plus the name
              chip of a hovered/focused dot. Purely visual and drawn above the
              dots; the dots (and the list) carry the accessible names. */}
            <g aria-hidden="true" pointerEvents="none">
              {stops.map((stop, i) => {
                const isCurrent = i === current;
                if (!isCurrent && highlight !== i) return null;
                const p = points[i];
                const text = chipText(stop.label);
                const width = chipWidth(text);
                const chip = chipPlacement(p, width, box);
                return (
                  <g
                    key={i}
                    data-pin=""
                    data-px={p.x.toFixed(2)}
                    data-py={p.y.toFixed(2)}
                    transform={`translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})`}
                    data-testid={isCurrent ? "journey-current-pin" : undefined}
                  >
                    {isCurrent ? (
                      <>
                        <circle
                          r={BIG_PIN_R}
                          fill="#d6455f"
                          stroke="#ffffff"
                          strokeWidth="1.4"
                        />
                        <text
                          textAnchor="middle"
                          dominantBaseline="central"
                          fontSize="5.6"
                          fontWeight="700"
                          fill="#ffffff"
                        >
                          {i + 1}
                        </text>
                        {subsByMain[i].length > 0 ? (
                          <CountBadge
                            n={subsByMain[i].length}
                            x={3.6}
                            y={-5.6}
                          />
                        ) : null}
                      </>
                    ) : null}
                    <g
                      data-testid="journey-label-chip"
                      data-chip={`${chip.x} ${chip.y} ${chip.x + width} ${chip.y + CHIP_H}`}
                    >
                      <rect
                        x={chip.x}
                        y={chip.y}
                        width={width}
                        height={CHIP_H}
                        rx={CHIP_H / 2}
                        fill="#ffffff"
                        fillOpacity="0.95"
                        stroke={isCurrent ? "#ef6f86" : "#2b6cb0"}
                        strokeWidth="0.7"
                      />
                      <text
                        x={chip.x + width / 2}
                        y={chip.y + CHIP_H / 2}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={CHIP_FONT}
                        fontWeight="600"
                        fill="#3a2a2e"
                      >
                        {text}
                      </text>
                    </g>
                  </g>
                );
              })}
              {openMain !== null
                ? subsByMain[openMain].map((sub, si) => {
                    if (activeSub !== si && highlightSub !== si) return null;
                    const p = subPoints[si];
                    if (!p) return null;
                    const text = chipText(`${sub.id} ${sub.stop.label}`);
                    const width = chipWidth(text);
                    const chip = chipPlacement(p, width, box);
                    return (
                      <g
                        key={`sub-${si}`}
                        data-pin=""
                        data-px={p.x.toFixed(2)}
                        data-py={p.y.toFixed(2)}
                        transform={`translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})`}
                      >
                        <g
                          data-testid="journey-sub-chip"
                          data-chip={`${chip.x} ${chip.y} ${chip.x + width} ${chip.y + CHIP_H}`}
                        >
                          <rect
                            x={chip.x}
                            y={chip.y}
                            width={width}
                            height={CHIP_H}
                            rx={CHIP_H / 2}
                            fill="#ffffff"
                            fillOpacity="0.95"
                            stroke="#2b6cb0"
                            strokeWidth="0.7"
                          />
                          <text
                            x={chip.x + width / 2}
                            y={chip.y + CHIP_H / 2}
                            textAnchor="middle"
                            dominantBaseline="central"
                            fontSize={CHIP_FONT}
                            fontWeight="600"
                            fill="#3a2a2e"
                          >
                            {text}
                          </text>
                        </g>
                      </g>
                    );
                  })
                : null}
            </g>

            {showVehicle ? (
              <g
                ref={vehicleRef}
                aria-hidden="true"
                pointerEvents="none"
                // Server-rendered parked at stop 1, so it never flashes at the
                // picture's top-left corner before the first frame.
                transform={`translate(${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)})`}
              >
                {travel?.ferry ? <Ferry /> : <Campervan />}
              </g>
            ) : null}
          </svg>

          <p id={helpId} className="sr-only">
            {t("controls.help")}
          </p>
          {hint ? (
            <div
              data-testid="journey-hint"
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-black/55 p-6 text-center text-base font-medium text-white"
            >
              {t(`controls.hint.${hint}`)}
            </div>
          ) : null}
          {openMain !== null ? (
            <button
              ref={backRef}
              type="button"
              onClick={() => closeGroup({ resume: true, refocus: true })}
              className="absolute left-3 top-3 inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border-subtle bg-background px-3 py-2 text-sm font-medium shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <span aria-hidden="true">←</span>
              {t("backToJourney")}
            </button>
          ) : null}
          <div className="absolute bottom-3 right-3 flex flex-col items-end gap-2">
            {!reducedMotion ? (
              <button
                type="button"
                onClick={followVan}
                aria-pressed={!manual}
                aria-label={t("controls.follow")}
                title={t("controls.follow")}
                className={`${CONTROL_BUTTON} rounded-lg border border-border-subtle shadow-md ${
                  manual ? "" : "text-accent"
                }`}
              >
                <RecentreIcon />
              </button>
            ) : (
              <button
                type="button"
                onClick={followVan}
                aria-label={t("controls.reset")}
                title={t("controls.reset")}
                className={`${CONTROL_BUTTON} rounded-lg border border-border-subtle shadow-md`}
              >
                <RecentreIcon />
              </button>
            )}
            <div className="flex flex-col overflow-hidden rounded-lg border border-border-subtle shadow-md">
              <button
                type="button"
                onClick={() => zoomBy(BUTTON_ZOOM, null, true)}
                aria-label={t("controls.zoomIn")}
                title={t("controls.zoomIn")}
                className={CONTROL_BUTTON}
              >
                <ZoomIcon plus />
              </button>
              <button
                type="button"
                onClick={() => zoomBy(1 / BUTTON_ZOOM, null, true)}
                aria-label={t("controls.zoomOut")}
                title={t("controls.zoomOut")}
                className={`${CONTROL_BUTTON} border-t border-border-subtle`}
              >
                <ZoomIcon plus={false} />
              </button>
            </div>
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {!reducedMotion && count >= 2 ? (
              <button
                type="button"
                onClick={togglePlay}
                className="journiq-button inline-flex items-center gap-2 bg-accent text-accent-foreground"
              >
                {finished ? t("replay") : playing ? t("pause") : t("play")}
              </button>
            ) : null}
            <p
              role="status"
              aria-live="polite"
              className="min-w-0 text-sm text-muted-foreground"
            >
              {statusText}
            </p>
          </div>

          <div
            ref={listRef}
            className="relative mt-4 p-1 md:max-h-[34rem] md:overflow-y-auto"
          >
            <ol aria-label={t("stopsList")} className="m-0 list-none p-0">
              {stops.map((stop, i) => {
                const state =
                  i < current
                    ? "visited"
                    : i === current
                      ? "current"
                      : "upcoming";
                const isLast = i === count - 1;
                const driving = travel !== null && travel.to === i + 1;
                return (
                  <li
                    key={i}
                    ref={(el) => {
                      itemRefs.current[i] = el;
                    }}
                    data-state={state}
                    aria-current={state === "current" ? "step" : undefined}
                    onMouseEnter={() => setHighlight(i)}
                    onMouseLeave={() => setHighlight(null)}
                    onFocus={() => setHighlight(i)}
                    onBlur={() => setHighlight(null)}
                    className={`relative pl-12 ${isLast ? "" : "pb-7"}`}
                  >
                    {!isLast ? (
                      <div
                        aria-hidden="true"
                        data-testid="journey-connector"
                        className="absolute bottom-0 left-[1.1rem] top-9 w-[3px] rounded-full bg-border-subtle"
                      >
                        <div
                          ref={(el) => {
                            fillRefs.current[i] = el;
                          }}
                          className="absolute inset-0 origin-top rounded-full bg-accent"
                          style={{
                            transform: i < current ? "scaleY(1)" : "scaleY(0)",
                          }}
                        />
                        {driving && travel ? (
                          <div
                            ref={(el) => {
                              iconRefs.current[i] = el;
                            }}
                            className="absolute left-1/2 top-0 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border-subtle bg-surface"
                          >
                            <svg viewBox="-12 -12 24 24" className="h-5 w-5">
                              {travel.ferry ? (
                                <Ferry testId={null} />
                              ) : (
                                <Campervan testId={null} />
                              )}
                            </svg>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <span
                      aria-hidden="true"
                      className={`absolute left-0 top-0 flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-bold ${
                        state === "upcoming"
                          ? "border-muted-foreground/60 bg-surface text-muted-foreground"
                          : "border-accent bg-accent text-accent-foreground"
                      } ${
                        state === "current"
                          ? "ring-4 ring-accent/35 motion-safe:animate-pulse"
                          : ""
                      } ${highlight === i && state !== "current" ? "ring-4 ring-[#2b6cb0]/50" : ""}`}
                    >
                      {i + 1}
                    </span>

                    <div
                      className={`rounded-xl px-3 py-1.5 ${
                        state === "current"
                          ? "bg-surface-muted"
                          : highlight === i
                            ? "bg-surface-muted/60"
                            : ""
                      }`}
                    >
                      {state === "current" && count > 1 ? (
                        <p className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          {t("stopOf", { n: i + 1, total: count })}
                        </p>
                      ) : null}
                      <button
                        type="button"
                        onClick={(event) => chooseMain(i, event.currentTarget)}
                        aria-expanded={
                          subsByMain[i].length > 0 ? openMain === i : undefined
                        }
                        className={`press block min-h-11 w-full rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                          state === "current"
                            ? "text-lg font-semibold"
                            : state === "upcoming"
                              ? "text-base text-muted-foreground"
                              : "text-base font-medium"
                        }`}
                      >
                        {stop.label}
                        {subsByMain[i].length > 0 ? (
                          <span
                            data-testid="journey-more-places"
                            className="ml-2 inline-block whitespace-nowrap rounded-full bg-[#2b6cb0]/15 px-2 py-0.5 align-middle text-xs font-semibold text-[#2b6cb0] dark:text-[#8ec1f2]"
                          >
                            {t("morePlaces", { count: subsByMain[i].length })}
                          </span>
                        ) : null}
                      </button>
                      <p
                        data-testid="journey-story-title"
                        className="text-sm text-muted-foreground"
                      >
                        {stop.storyTitle}
                      </p>
                      <Link
                        href={stop.href}
                        className={`inline-flex min-h-11 items-center rounded-sm text-sm underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                          state === "upcoming" ? "text-muted-foreground" : ""
                        }`}
                      >
                        {t("readThisStory")}
                        <span className="sr-only">: {stop.storyTitle}</span>
                      </Link>
                      {openMain === i ? (
                        <ol
                          aria-label={t("insideList", { label: stop.label })}
                          className="m-0 mt-2 list-none space-y-2 border-l-2 border-dotted border-[#2b6cb0]/50 p-0 pl-3"
                        >
                          {subsByMain[i].map((sub, si) => {
                            return (
                              <li
                                key={si}
                                onMouseEnter={() => setHighlightSub(si)}
                                onMouseLeave={() => setHighlightSub(null)}
                                className={`rounded-lg px-2 py-1 ${activeSub === si || highlightSub === si ? "bg-surface-muted" : ""}`}
                              >
                                <button
                                  type="button"
                                  aria-pressed={activeSub === si}
                                  onClick={() =>
                                    setActiveSub(activeSub === si ? null : si)
                                  }
                                  className="flex min-h-9 w-full items-center gap-2 rounded-md text-left text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                                >
                                  <span
                                    aria-hidden="true"
                                    className="inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-[#2b6cb0] px-1 text-xs font-bold"
                                  >
                                    {sub.id}
                                  </span>
                                  <span className="min-w-0">
                                    {sub.stop.label}
                                  </span>
                                </button>
                                <p className="pl-8 text-sm text-muted-foreground">
                                  {sub.stop.storyTitle}
                                </p>
                                <Link
                                  href={sub.stop.href}
                                  className="ml-8 inline-block rounded-sm text-sm underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                                >
                                  {t("readThisStory")}
                                  <span className="sr-only">
                                    : {sub.stop.storyTitle}
                                  </span>
                                </Link>
                              </li>
                            );
                          })}
                        </ol>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
