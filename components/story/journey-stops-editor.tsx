"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type KeyboardEvent,
} from "react";
import { useTranslations } from "next-intl";
import {
  JOURNEY_VIEWBOX,
  MAX_JOURNEY_LABEL_LENGTH,
  MAX_JOURNEY_MAIN_STOPS,
  MAX_JOURNEY_STOPS,
  MAX_SUB_STOPS_PER_MAIN,
  NZ_BOUNDS,
  isInsideNz,
  latLngToPoint,
  pointToLatLng,
  roundCoordinate,
} from "@/lib/journey/geo";
import { parseGoogleMapsUrl } from "@/lib/journey/google-maps-link";
import type { ResolveLinkResult } from "@/lib/journey/resolve-google-maps-link";
import { smoothPath } from "@/lib/journey/path";
import {
  canMove,
  countMains,
  moveAmongSiblings,
  normalizeStops,
  removeWithChildren,
  stopIds,
  subsOf,
} from "@/lib/journey/draft";
import type { JourneyStopView } from "@/lib/journey/schema";
import { resolveGoogleMapsLinkAction } from "@/app/(contributor)/stories/[id]/edit/actions";
import type { StoryHeading } from "@/lib/story/headings";
import { JourneyBackdrop } from "@/components/story/journey-backdrop";
import { JourneyCities } from "@/components/story/journey-cities";
import { FULL_BOX, screenFit, type CameraBox } from "@/lib/journey/camera";
import {
  BUTTON_ZOOM,
  useMapGestures,
} from "@/components/story/use-map-gestures";
import { applyMapDetail, boxAttr, fmt } from "@/components/story/map-detail";
import {
  CONTROL_BUTTON,
  RecentreIcon,
  TrashIcon,
  ZoomIcon,
} from "@/components/story/map-control-icons";

/**
 * Contributor-side editor for the journey map: tap the picture of New
 * Zealand to pin a stop, name it, optionally link it to a heading in the
 * story, and put the stops in travel order.
 *
 * One-level hierarchy: a stop is a MAIN stop or a SUB-STOP ("place inside")
 * that belongs to one main stop, chosen by the contributor with each card's
 * "Part of" select or by the "Add places inside" mode. The list handed to
 * onChange is always in grouped order: each main stop followed by its own
 * sub-stops (see lib/journey/draft.ts).
 *
 * This is a controlled, presentational component. Saving (and the
 * authoritative rounding, bounds check, hierarchy rules and caps) happens
 * server-side in set_revision_stops(); everything here is a convenience.
 * Stop `key`s are client-only React keys -- they are never sent anywhere
 * (a sub-stop's `parentKey` is turned into an array position when saving).
 */

export type JourneyDraftStop = {
  key: string;
  latitude: number;
  longitude: number;
  label: string;
  sectionAnchor: string | null;
  /** Key of the main stop this sits inside; null/absent for a main stop. */
  parentKey?: string | null;
};

const NUDGE_DEGREES = 0.25;
/** The editor zooms further than the reader map: pinning needs accuracy. */
export const EDITOR_MAX_ZOOM = 12;
/** Marker sizes in full-view SVG units; drawn at 1/zoom so they stay put on screen. */
const PIN_R = 4.6;
const PIN_FONT = 5.6;
/** Sub-stop pins are smaller than main-stop pins. */
const SUB_PIN_R = 3.4;
const SUB_PIN_FONT = 3.6;
/** Touch target around a pin, in screen px (radius), constant under zoom. */
const PIN_HIT_PX = 17;
/** How long the undo toast stays up. */
const TOAST_MS = 6000;

type Toast = { id: number; text: string; prev: JourneyDraftStop[] };

export type ResolveLink = (
  input: string,
) => Promise<ResolveLinkResult | { ok: false; reason: "unauthenticated" }>;

type LinkStatus = { kind: "error" | "success"; message: string } | null;

/** Cap to the label limit without splitting a surrogate pair. */
function capLabel(name: string): string {
  let out = name.trim().slice(0, MAX_JOURNEY_LABEL_LENGTH);
  const last = out.charCodeAt(out.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) out = out.slice(0, -1);
  return out.trim();
}

/**
 * Keys for stops loaded with the form. Index-based so the server render and
 * hydration agree (the keys also feed label/input ids); a module-level
 * counter differs between the server process and the browser.
 */
export function initialStopKey(index: number): string {
  return `stop-initial-${index}`;
}

// Only for stops added in the browser, after hydration. Different prefix,
// so it can never collide with initialStopKey().
let keyCounter = 0;
export function newStopKey(): string {
  keyCounter += 1;
  return `stop-new-${keyCounter}`;
}

/** Saved stops as editor drafts, with hydration-safe keys (see above). */
export function draftsFromViews(views: JourneyStopView[]): JourneyDraftStop[] {
  return views.map((view, i) => ({
    latitude: view.latitude,
    longitude: view.longitude,
    label: view.label,
    sectionAnchor: view.sectionAnchor,
    key: initialStopKey(i),
    parentKey:
      view.parentIndex === null || view.parentIndex === undefined
        ? null
        : initialStopKey(view.parentIndex),
  }));
}

export function JourneyStopsEditor({
  stops: propStops,
  headings,
  onChange,
  resolveLink = resolveGoogleMapsLinkAction,
}: {
  stops: JourneyDraftStop[];
  /** Headings in the story as it is right now (lib/story/headings.ts). */
  headings: StoryHeading[];
  onChange: (next: JourneyDraftStop[]) => void;
  /** Resolves a short Google Maps link on the server. Overridable for previews. */
  resolveLink?: ResolveLink;
}) {
  const t = useTranslations("journey.editor");
  const tc = useTranslations("journey.controls");
  const baseId = useId();
  /** The friendly message for whichever cap stops the next addition. */
  function limitMessage(total: number, mains: number, inside: boolean): string {
    if (total >= MAX_JOURNEY_STOPS) {
      return t("limit", { max: MAX_JOURNEY_STOPS });
    }
    if (inside) return t("limitInside", { max: MAX_SUB_STOPS_PER_MAIN });
    if (mains >= MAX_JOURNEY_MAIN_STOPS) {
      return t("limitMain", { max: MAX_JOURNEY_MAIN_STOPS });
    }
    return "";
  }
  const svgRef = useRef<SVGSVGElement | null>(null);
  const routeRef = useRef<SVGPathElement | null>(null);
  // Camera: where the viewBox is now. Written straight to the DOM (no React
  // render per gesture frame), like the reader map.
  const cam = useRef<CameraBox>({ ...FULL_BOX });
  // Always work on the grouped order (each main stop, then its sub-stops).
  const stops = useMemo(() => normalizeStops(propStops), [propStops]);
  const ids = stopIds(stops);
  const mainCount = countMains(stops);
  // "Add places inside" mode: map taps and pasted links add sub-stops to this
  // main stop. Derived, so it ends by itself if that stop goes away.
  const [addingKey, setAddingKey] = useState<string | null>(null);
  const addingMain =
    addingKey !== null
      ? (stops.find((s) => s.key === addingKey && !s.parentKey) ?? null)
      : null;
  const addingSubCount = addingMain ? subsOf(stops, addingMain.key).length : 0;
  const atLimit = addingMain
    ? stops.length >= MAX_JOURNEY_STOPS ||
      addingSubCount >= MAX_SUB_STOPS_PER_MAIN
    : stops.length >= MAX_JOURNEY_STOPS || mainCount >= MAX_JOURNEY_MAIN_STOPS;
  const limitText = atLimit
    ? limitMessage(stops.length, mainCount, addingMain !== null)
    : "";
  const anyBlankLabel = stops.some((s) => s.label.trim() === "");
  const points = stops.map(latLngToPoint);
  const mainPoints = points.filter((_, i) => !stops[i].parentKey);
  const routePath = smoothPath(mainPoints);
  // A dotted line main -> a -> b for each main stop that has sub-stops.
  const subRoutes = stops.flatMap((stop, i) => {
    if (stop.parentKey) return [];
    const group = [points[i]];
    stops.forEach((s, j) => {
      if (s.parentKey === stop.key) group.push(points[j]);
    });
    return group.length > 1
      ? [
          {
            key: stop.key,
            d: `M${group.map((p) => `${p.x} ${p.y}`).join(" L")}`,
          },
        ]
      : [];
  });
  const pointsRef = useRef(points);
  const popRef = useRef<HTMLDivElement | null>(null);
  const selectedPointRef = useRef<{ x: number; y: number } | null>(null);

  /** Push the camera to the DOM: viewBox, constant-size markers and route, map detail. */
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
    const rect = svg.getBoundingClientRect();
    const fit = rect.width > 0 && rect.height > 0 ? screenFit(rect, c) : null;
    if (fit) {
      // Pin units are drawn at k, so one pin unit is k * scale screen px.
      const hitR = Math.max(PIN_R, PIN_HIT_PX / (k * fit.scale));
      svg
        .querySelectorAll<SVGCircleElement>("[data-hit]")
        .forEach((hit) => hit.setAttribute("r", String(fmt(hitR))));
      const pop = popRef.current;
      const sp = selectedPointRef.current;
      if (pop && sp) {
        const x = fit.offsetX + (sp.x - c.x) * fit.scale;
        const y = fit.offsetY + (sp.y - c.y) * fit.scale;
        const w = pop.offsetWidth || 180;
        const h = pop.offsetHeight || 44;
        const gap = 24;
        let top = y - gap - h;
        if (top < 4) top = y + gap;
        top = Math.max(4, Math.min(top, rect.height - h - 4));
        const left = Math.max(4, Math.min(x - w / 2, rect.width - w - 4));
        pop.style.left = `${Math.round(left)}px`;
        pop.style.top = `${Math.round(top)}px`;
      }
    }
    const route = routeRef.current;
    if (route) {
      route.setAttribute("stroke-width", String(fmt(2 * k)));
      route.setAttribute("stroke-dasharray", `${fmt(k)} ${fmt(5 * k)}`);
    }
    svg.querySelectorAll<SVGElement>("[data-subroute]").forEach((el) => {
      el.setAttribute("stroke-width", String(fmt(1.2 * k)));
      el.setAttribute("stroke-dasharray", `${fmt(0.7 * k)} ${fmt(3 * k)}`);
    });
    applyMapDetail(svg, k, pointsRef.current);
  }, []);
  const getBase = useCallback((): CameraBox => cam.current, []);
  const setView = useCallback(
    (next: CameraBox) => {
      cam.current = { ...next };
      applyCamera();
    },
    [applyCamera],
  );
  const gestures = useMapGestures({
    svgRef,
    getBase,
    setView,
    maxZoom: EDITOR_MAX_ZOOM,
    doubleZoom: false,
  });
  // React may have just re-rendered markers at their base transform: put the
  // current camera's scaling back before the browser paints.
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selectedIndex = selectedKey
    ? stops.findIndex((s) => s.key === selectedKey)
    : -1;
  const [toast, setToast] = useState<Toast | null>(null);
  const toastSeq = useRef(0);
  const focusPopoverRef = useRef(false);
  const pendingFocusRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    pointsRef.current = points;
    selectedPointRef.current =
      selectedIndex >= 0 ? points[selectedIndex] : null;
    applyCamera();
  });
  useEffect(() => {
    if (selectedIndex >= 0 && focusPopoverRef.current) {
      focusPopoverRef.current = false;
      popRef.current
        ?.querySelector<HTMLButtonElement>("button:last-child")
        ?.focus();
    }
  });
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);
  // After a keyboard removal, focus goes to the next pin (or the map).
  useEffect(() => {
    const target = pendingFocusRef.current;
    if (!target) return;
    pendingFocusRef.current = null;
    const el =
      target === "map"
        ? svgRef.current
        : document.getElementById(`${baseId}-pin-${target}`);
    (el as HTMLElement | SVGElement | null)?.focus();
  }, [stops, baseId]);

  /** Every stops change that can be undone goes through here. */
  function commit(next: JourneyDraftStop[], text: string) {
    toastSeq.current += 1;
    setToast({ id: toastSeq.current, text, prev: stops });
    onChange(normalizeStops(next));
  }
  /** Any other edit makes the saved "previous" array stale: drop it. */
  function edit(next: JourneyDraftStop[]) {
    setToast(null);
    onChange(normalizeStops(next));
  }
  function undo() {
    if (!toast) return;
    const prev = toast.prev;
    setToast(null);
    setSelectedKey(null);
    onChange(prev);
  }

  const [link, setLink] = useState("");
  const [resolving, setResolving] = useState(false);
  const [linkStatus, setLinkStatus] = useState<LinkStatus>(null);
  const stopsRef = useRef(stops);
  const addingKeyRef = useRef<string | null>(null);
  useEffect(() => {
    stopsRef.current = stops;
    addingKeyRef.current = addingMain ? addingMain.key : null;
  }, [stops, addingMain]);
  const focusKeyRef = useRef<string | null>(null);

  // After a stop is added from a link, move focus to its name field.
  useEffect(() => {
    const key = focusKeyRef.current;
    if (!key) return;
    const el = document.getElementById(`${baseId}-label-${key}`);
    if (el) {
      focusKeyRef.current = null;
      el.focus();
    }
  }, [stops, baseId]);

  /**
   * Why `current` cannot take one more stop right now (null = it can): the
   * total cap, the 12-main-stop cap, or the 8-places-inside cap while the
   * "adding inside" mode is on.
   */
  function addBlockedReason(
    current: JourneyDraftStop[],
    insideKey: string | null,
  ): string | null {
    const message = limitMessage(
      current.length,
      countMains(current),
      insideKey !== null,
    );
    if (current.length >= MAX_JOURNEY_STOPS) return message;
    if (insideKey !== null) {
      return subsOf(current, insideKey).length >= MAX_SUB_STOPS_PER_MAIN
        ? message
        : null;
    }
    return countMains(current) >= MAX_JOURNEY_MAIN_STOPS ? message : null;
  }

  /** The new stop, as a sub-stop of `insideKey` when that mode is on. */
  function newStop(
    insideKey: string | null,
    latitude: number,
    longitude: number,
    label: string,
  ): JourneyDraftStop {
    return {
      key: newStopKey(),
      latitude,
      longitude,
      label,
      sectionAnchor: null,
      parentKey: insideKey,
    };
  }

  function addAt(latitude: number, longitude: number, label = "") {
    const insideKey = addingMain ? addingMain.key : null;
    if (addBlockedReason(stops, insideKey)) return;
    const fresh = newStop(insideKey, latitude, longitude, label);
    const next = normalizeStops([...stops, fresh]);
    const id = stopIds(next)[next.indexOf(fresh)];
    const parentName = addingMain
      ? addingMain.label.trim() ||
        t("unnamedStop", { n: ids[stops.indexOf(addingMain)] })
      : "";
    commit(
      next,
      addingMain
        ? t("toast.addedInside", { id, parent: parentName })
        : t("toast.added", { n: mainCount + 1 }),
    );
  }

  function failureMessage(reason: string): string {
    switch (reason) {
      case "not_found":
        return t("linkErrors.notFound");
      case "outside_nz":
        return t("linkErrors.outsideNz");
      case "unreachable":
        return t("linkErrors.unreachable");
      case "unauthenticated":
        return t("linkErrors.unauthenticated");
      default:
        return t("linkErrors.invalid");
    }
  }

  async function addFromLink() {
    const input = link.trim();
    if (resolving) return;
    if (input === "") {
      setLinkStatus({ kind: "error", message: t("linkErrors.empty") });
      return;
    }
    const blocked = addBlockedReason(stopsRef.current, addingKeyRef.current);
    if (blocked) {
      setLinkStatus({ kind: "error", message: blocked });
      return;
    }
    setLinkStatus(null);

    // Full links are parsed right here; only short links need the server.
    let place: {
      latitude: number;
      longitude: number;
      placeName: string | null;
    };
    const local = parseGoogleMapsUrl(input);
    if (local) {
      place = local;
    } else {
      setResolving(true);
      try {
        const result = await resolveLink(input);
        if (!result.ok) {
          setLinkStatus({
            kind: "error",
            message: failureMessage(result.reason),
          });
          return;
        }
        place = result;
      } catch {
        setLinkStatus({ kind: "error", message: t("linkErrors.unreachable") });
        return;
      } finally {
        setResolving(false);
      }
    }

    if (!isInsideNz(place)) {
      setLinkStatus({ kind: "error", message: t("linkErrors.outsideNz") });
      return;
    }
    const current = stopsRef.current;
    const insideKey = addingKeyRef.current;
    const blockedNow = addBlockedReason(current, insideKey);
    if (blockedNow) {
      setLinkStatus({ kind: "error", message: blockedNow });
      return;
    }
    const label = place.placeName ? capLabel(place.placeName) : "";
    const fresh = newStop(insideKey, place.latitude, place.longitude, label);
    focusKeyRef.current = fresh.key;
    onChange(normalizeStops([...current, fresh]));
    setLink("");
    setLinkStatus({
      kind: "success",
      message: label ? t("linkAdded", { name: label }) : t("linkAddedNoName"),
    });
  }

  function handleMapClick(event: MouseEvent<SVGSVGElement>) {
    // A drag, pinch or swipe moves the map; only a plain tap pins a stop.
    if (gestures.wasGesture()) return;
    // With a popover open, the first tap on empty map only closes it.
    if (selectedKey) {
      setSelectedKey(null);
      return;
    }
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    // Through the CURRENT viewBox (zoom, pan, letterboxing) back to lat/lng.
    const at = gestures.toSvgPoint(event.clientX, event.clientY, cam.current);
    // The sea margin around the picture is not part of New Zealand.
    if (
      at.x < 0 ||
      at.y < 0 ||
      at.x > JOURNEY_VIEWBOX.width ||
      at.y > JOURNEY_VIEWBOX.height
    ) {
      return;
    }
    const { latitude, longitude } = pointToLatLng(at);
    addAt(latitude, longitude);
  }

  function addAtViewCentre() {
    const c = cam.current;
    const { latitude, longitude } = pointToLatLng({
      x: c.x + c.w / 2,
      y: c.y + c.h / 2,
    });
    addAt(latitude, longitude);
  }

  function update(index: number, patch: Partial<JourneyDraftStop>) {
    edit(stops.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  /** Move among siblings: a main stop with its places, or a place inside its stop. */
  function move(index: number, delta: -1 | 1) {
    const next = moveAmongSiblings(stops, stops[index].key, delta);
    if (next) edit(next);
  }

  /**
   * Change which main stop a stop is inside (null = make it a main stop).
   * The option list already disables impossible choices; this re-checks.
   */
  function setParent(index: number, parentKey: string | null) {
    const stop = stops[index];
    if (parentKey === stop.key) return;
    if (parentKey !== null) {
      const parent = stops.find((s) => s.key === parentKey && !s.parentKey);
      if (!parent) return;
      if (subsOf(stops, stop.key).length > 0) return;
      if (
        stop.parentKey !== parentKey &&
        subsOf(stops, parentKey).length >= MAX_SUB_STOPS_PER_MAIN
      ) {
        return;
      }
    } else if (stop.parentKey && mainCount >= MAX_JOURNEY_MAIN_STOPS) {
      return;
    }
    update(index, { parentKey });
  }

  /**
   * The one removal path: map popover, pin keyboard and card all use it.
   * Removing a main stop removes the places inside it too, in this one
   * commit, so a single Undo brings all of them back.
   */
  function removeStop(index: number, focusNext = false) {
    const stop = stops[index];
    if (!stop) return;
    const name = stop.label.trim();
    const { next, removed } = removeWithChildren(stops, stop.key);
    const inside = removed.length - 1;
    if (focusNext) {
      const after = stops.slice(index + 1).find((s) => next.includes(s));
      pendingFocusRef.current = after?.key ?? "map";
    }
    setSelectedKey(null);
    let text: string;
    if (inside > 0) {
      text = name
        ? t("toast.removedWithSubs", { name, count: inside })
        : t("toast.removedUnnamedWithSubs", { n: ids[index], count: inside });
    } else {
      text = name
        ? t("toast.removed", { name })
        : t("toast.removedUnnamed", { n: ids[index] });
    }
    commit(next, text);
  }

  function editStop(index: number) {
    const stop = stops[index];
    if (!stop) return;
    setSelectedKey(null);
    const el = document.getElementById(`${baseId}-label-${stop.key}`);
    el?.scrollIntoView?.({ block: "center" });
    el?.focus();
  }

  function pinKeyDown(index: number, event: KeyboardEvent<SVGGElement>) {
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      removeStop(index, true);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      focusPopoverRef.current = true;
      setSelectedKey(stops[index].key);
    } else {
      nudge(index, event);
    }
  }

  function groupKeyDown(event: KeyboardEvent<HTMLFieldSetElement>) {
    if (event.key === "Escape" && !selectedKey && addingMain) {
      setAddingKey(null);
      return;
    }
    if (event.key === "Escape" && selectedKey) {
      const pin = document.getElementById(`${baseId}-pin-${selectedKey}`);
      const inPopover = popRef.current?.contains(event.target as Node);
      setSelectedKey(null);
      if (inPopover) pin?.focus();
      return;
    }
    if (
      (event.ctrlKey || event.metaKey) &&
      !event.shiftKey &&
      !event.altKey &&
      event.key.toLowerCase() === "z" &&
      toast
    ) {
      const el = event.target as HTMLElement;
      if (el.closest?.("input, textarea, select, [contenteditable='true']")) {
        return;
      }
      event.preventDefault();
      undo();
    }
  }

  function nudge(index: number, event: KeyboardEvent<SVGGElement>) {
    const stop = stops[index];
    const delta: Record<string, [number, number]> = {
      ArrowUp: [NUDGE_DEGREES, 0],
      ArrowDown: [-NUDGE_DEGREES, 0],
      ArrowLeft: [0, -NUDGE_DEGREES],
      ArrowRight: [0, NUDGE_DEGREES],
    };
    const d = delta[event.key];
    if (!d) return;
    event.preventDefault();
    update(index, {
      latitude: roundCoordinate(
        Math.min(
          NZ_BOUNDS.maxLat,
          Math.max(NZ_BOUNDS.minLat, stop.latitude + d[0]),
        ),
      ),
      longitude: roundCoordinate(
        Math.min(
          NZ_BOUNDS.maxLng,
          Math.max(NZ_BOUNDS.minLng, stop.longitude + d[1]),
        ),
      ),
    });
  }

  /** One stop's editing card (main stops and places inside look alike). */
  function renderCard(stop: JourneyDraftStop, i: number) {
    const labelId = `${baseId}-label-${stop.key}`;
    const sectionId = `${baseId}-section-${stop.key}`;
    const parentId = `${baseId}-parent-${stop.key}`;
    const isSub = Boolean(stop.parentKey);
    const hasSubs = !isSub && subsOf(stops, stop.key).length > 0;
    // A saved anchor whose heading has since been renamed is
    // kept selectable so it is not silently dropped.
    const knownAnchor =
      stop.sectionAnchor === null ||
      headings.some((h) => h.anchor === stop.sectionAnchor);
    const mainsHere = stops
      .map((s, idx) => ({ s, idx }))
      .filter(({ s, idx }) => !s.parentKey && idx !== i);
    const cannotBeMain = isSub && mainCount >= MAX_JOURNEY_MAIN_STOPS;
    return (
      <div
        className="rounded-lg border border-border-subtle p-3"
        data-testid={isSub ? "journey-sub-card" : "journey-main-card"}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">
            {isSub
              ? t("subHeading", { id: ids[i] })
              : t("stopHeading", { n: ids[i] })}
          </p>
          <div className="flex gap-1">
            <button
              type="button"
              aria-label={t("moveUp", { n: ids[i] })}
              disabled={!canMove(stops, stop.key, -1)}
              onClick={() => move(i, -1)}
              className="rounded-md border border-border-subtle px-2 py-1 text-sm disabled:opacity-40"
            >
              <span aria-hidden="true">↑</span>
            </button>
            <button
              type="button"
              aria-label={t("moveDown", { n: ids[i] })}
              disabled={!canMove(stops, stop.key, 1)}
              onClick={() => move(i, 1)}
              className="rounded-md border border-border-subtle px-2 py-1 text-sm disabled:opacity-40"
            >
              <span aria-hidden="true">↓</span>
            </button>
            <button
              type="button"
              aria-label={t("remove", { n: ids[i] })}
              onClick={() => removeStop(i)}
              className="rounded-md border border-border-subtle px-2 py-1 text-sm"
            >
              <span aria-hidden="true">✕</span>
            </button>
          </div>
        </div>

        <label htmlFor={labelId} className="mt-2 block text-sm">
          {t("labelField")}
        </label>
        <input
          id={labelId}
          type="text"
          value={stop.label}
          maxLength={MAX_JOURNEY_LABEL_LENGTH}
          placeholder={t("labelPlaceholder")}
          onChange={(e) => update(i, { label: e.target.value })}
          className="mt-1 w-full rounded-md border border-border-subtle bg-background px-3 py-2 text-base"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          {t("labelHelp", { max: MAX_JOURNEY_LABEL_LENGTH })}
        </p>

        <label htmlFor={parentId} className="mt-2 block text-sm">
          {t("partOfField")}
        </label>
        <select
          id={parentId}
          value={stop.parentKey ?? ""}
          onChange={(e) => setParent(i, e.target.value || null)}
          aria-describedby={hasSubs ? `${parentId}-hint` : undefined}
          className="mt-1 w-full rounded-md border border-border-subtle bg-background px-3 py-2 text-base"
        >
          <option value="" disabled={cannotBeMain}>
            {t("partOfMain")}
          </option>
          {mainsHere.map(({ s, idx }) => {
            const full =
              s.key !== stop.parentKey &&
              subsOf(stops, s.key).length >= MAX_SUB_STOPS_PER_MAIN;
            const name = s.label.trim() || t("unnamedStop", { n: ids[idx] });
            return (
              <option key={s.key} value={s.key} disabled={hasSubs || full}>
                {full
                  ? t("partOfInsideFull", { label: name })
                  : t("partOfInside", { label: name })}
              </option>
            );
          })}
        </select>
        {hasSubs ? (
          <p
            id={`${parentId}-hint`}
            className="mt-1 text-xs text-muted-foreground"
          >
            {t("partOfHasPlaces")}
          </p>
        ) : null}
        {cannotBeMain ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {t("limitMain", { max: MAX_JOURNEY_MAIN_STOPS })}
          </p>
        ) : null}

        <label htmlFor={sectionId} className="mt-2 block text-sm">
          {t("sectionField")}
        </label>
        <select
          id={sectionId}
          value={stop.sectionAnchor ?? ""}
          onChange={(e) => update(i, { sectionAnchor: e.target.value || null })}
          className="mt-1 w-full rounded-md border border-border-subtle bg-background px-3 py-2 text-base"
        >
          <option value="">{t("sectionNone")}</option>
          {!knownAnchor && stop.sectionAnchor ? (
            <option value={stop.sectionAnchor}>{stop.sectionAnchor}</option>
          ) : null}
          {headings.map((h) => (
            <option key={h.anchor} value={h.anchor}>
              {`${"– ".repeat(Math.max(0, h.depth - 2))}${h.text}`}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <fieldset
      className="mt-8 rounded-xl border border-border-subtle p-4"
      onKeyDown={groupKeyDown}
    >
      <legend className="px-1 text-sm font-medium">{t("title")}</legend>
      <p className="text-sm text-muted-foreground">
        {t("hint", {
          max: MAX_JOURNEY_MAIN_STOPS,
          inside: MAX_SUB_STOPS_PER_MAIN,
        })}
      </p>

      <div className="mt-3">
        {addingMain ? (
          <div
            role="status"
            data-testid="journey-adding-banner"
            className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#2b6cb0]/60 bg-[#2b6cb0]/10 px-3 py-2 text-sm"
          >
            <p className="min-w-0 font-medium">
              {t("addingBanner", {
                label:
                  addingMain.label.trim() ||
                  t("unnamedStop", { n: ids[stops.indexOf(addingMain)] }),
              })}
            </p>
            <button
              type="button"
              onClick={() => setAddingKey(null)}
              className="min-h-9 rounded-md border border-border-subtle bg-background px-3 py-1 font-semibold"
            >
              {t("addingDone")}
            </button>
          </div>
        ) : null}
        <div className="relative">
          {/* The click target is the picture; keyboard users get the button
            below (adds a stop at the middle of the view) and arrow keys to
            nudge a focused pin. */}
          <svg
            ref={svgRef}
            viewBox={`0 0 ${JOURNEY_VIEWBOX.width} ${JOURNEY_VIEWBOX.height}`}
            role="group"
            aria-label={t("mapLabel")}
            aria-describedby={`${baseId}-help`}
            tabIndex={0}
            // One finger keeps scrolling the page; pinch / two-finger drag
            // and mouse drag move the map.
            style={{ touchAction: "pan-y", background: "var(--map-sea)" }}
            {...gestures.handlers}
            onKeyDown={(e) => {
              // Arrow keys on a focused pin nudge that pin, not the map.
              if (e.target === e.currentTarget) gestures.handlers.onKeyDown(e);
            }}
            onClick={handleMapClick}
            className={`block h-auto max-h-[min(80vh,760px)] w-full select-none rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:h-[min(80vh,760px)] ${atLimit ? "cursor-not-allowed" : "cursor-crosshair"}`}
            data-testid="journey-editor-map"
          >
            <JourneyBackdrop />
            <JourneyCities />
            {routePath ? (
              <path
                ref={routeRef}
                d={routePath}
                fill="none"
                stroke="#ef8a9a"
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray="1 5"
                pointerEvents="none"
              />
            ) : null}
            {subRoutes.map((route) => (
              <path
                key={route.key}
                data-subroute=""
                d={route.d}
                fill="none"
                stroke="#2b6cb0"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="0.7 3"
                pointerEvents="none"
              />
            ))}
            {stops.map((stop, i) => {
              const selected = i === selectedIndex;
              const isSub = Boolean(stop.parentKey);
              const r = isSub ? SUB_PIN_R : PIN_R;
              const parentStop = isSub
                ? stops.find((s) => s.key === stop.parentKey)
                : undefined;
              return (
                <g
                  key={stop.key}
                  id={`${baseId}-pin-${stop.key}`}
                  data-pin=""
                  data-px={points[i].x}
                  data-py={points[i].y}
                  transform={`translate(${points[i].x} ${points[i].y})`}
                  role="button"
                  tabIndex={0}
                  aria-label={
                    isSub
                      ? t("subPinLabel", {
                          id: ids[i],
                          named: stop.label ? "yes" : "no",
                          name: stop.label,
                          selected: selected ? "yes" : "no",
                          parent:
                            parentStop?.label.trim() ||
                            t("unnamedStop", {
                              n: ids[stops.indexOf(parentStop!)],
                            }),
                        })
                      : t("pinLabel", {
                          n: ids[i],
                          named: stop.label ? "yes" : "no",
                          name: stop.label,
                          selected: selected ? "yes" : "no",
                        })
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    // The end of a drag over a pin is not a tap on it.
                    if (gestures.wasGesture()) return;
                    setSelectedKey(selected ? null : stop.key);
                  }}
                  onKeyDown={(e) => pinKeyDown(i, e)}
                  className="cursor-pointer outline-none [&:focus-visible>circle]:stroke-[#2b6cb0] [&:focus-visible>circle]:stroke-[2.5]"
                >
                  {/* Invisible touch target; sized in applyCamera(). */}
                  <circle data-hit="" r={PIN_R * 2} fill="transparent" />
                  {selected ? (
                    <circle
                      r={r + 2.6}
                      fill="none"
                      stroke="#2b6cb0"
                      strokeWidth="1.6"
                      pointerEvents="none"
                    />
                  ) : null}
                  <circle
                    r={r}
                    fill={isSub ? "#bcd8f5" : "#ffb3c0"}
                    stroke="#ffffff"
                    strokeWidth="1.2"
                    pointerEvents="none"
                  />
                  <text
                    y="0.4"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={isSub ? SUB_PIN_FONT : PIN_FONT}
                    fontWeight="700"
                    fill={isSub ? "#1d3f66" : "#5a2330"}
                    aria-hidden="true"
                    pointerEvents="none"
                  >
                    {ids[i]}
                  </text>
                </g>
              );
            })}
          </svg>
          {selectedIndex >= 0 ? (
            <div
              ref={popRef}
              role="group"
              aria-label={t("popover.label", { n: ids[selectedIndex] })}
              className="absolute left-0 top-0 z-10 flex w-max max-w-[calc(100%-8px)] flex-col gap-2 rounded-lg border border-border-subtle bg-background p-2 text-sm shadow-lg"
            >
              <p className="max-w-60 truncate px-1 font-medium">
                {stops[selectedIndex].label.trim()
                  ? t("popover.title", {
                      n: ids[selectedIndex],
                      name: stops[selectedIndex].label,
                    })
                  : t("popover.titleUnnamed", { n: ids[selectedIndex] })}
              </p>
              <div className="flex flex-wrap gap-2">
                {!stops[selectedIndex].parentKey ? (
                  <button
                    type="button"
                    disabled={
                      stops.length >= MAX_JOURNEY_STOPS ||
                      subsOf(stops, stops[selectedIndex].key).length >=
                        MAX_SUB_STOPS_PER_MAIN
                    }
                    onClick={() => {
                      setAddingKey(stops[selectedIndex].key);
                      setSelectedKey(null);
                    }}
                    className="inline-flex min-h-9 items-center rounded-md border border-border-subtle px-3 py-1.5 font-medium disabled:opacity-50"
                  >
                    {t("popover.addInside")}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => removeStop(selectedIndex)}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border-subtle px-3 py-1.5 font-medium"
                >
                  <TrashIcon />
                  {t("popover.remove")}
                </button>
                <button
                  type="button"
                  onClick={() => editStop(selectedIndex)}
                  className="inline-flex min-h-9 items-center rounded-md border border-border-subtle px-3 py-1.5 font-medium"
                >
                  {t("popover.edit")}
                </button>
              </div>
            </div>
          ) : null}
          <div
            aria-live="polite"
            className="pointer-events-none absolute bottom-3 left-3 z-10 max-w-[calc(100%-5.5rem)]"
          >
            {toast ? (
              <div
                key={toast.id}
                className="pointer-events-auto flex items-center gap-3 rounded-lg bg-foreground py-1.5 pl-3 pr-1.5 text-sm text-background shadow-lg"
              >
                <span className="min-w-0 truncate">{toast.text}</span>
                <button
                  type="button"
                  onClick={undo}
                  className="min-h-9 shrink-0 rounded-md px-3 font-semibold underline"
                >
                  {t("toast.undo")}
                </button>
              </div>
            ) : null}
          </div>
          <p id={`${baseId}-help`} className="sr-only">
            {t("mapHelp")}
          </p>
          {gestures.hint ? (
            <div
              data-testid="journey-hint"
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-black/55 p-6 text-center text-base font-medium text-white"
            >
              {tc(`hint.${gestures.hint}`)}
            </div>
          ) : null}
          <div className="absolute bottom-3 right-3 flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={() => setView({ ...FULL_BOX })}
              aria-label={tc("reset")}
              title={tc("reset")}
              className={`${CONTROL_BUTTON} rounded-lg border border-border-subtle shadow-md`}
            >
              <RecentreIcon />
            </button>
            <div className="flex flex-col overflow-hidden rounded-lg border border-border-subtle shadow-md">
              <button
                type="button"
                onClick={() => gestures.zoomBy(BUTTON_ZOOM, null, false)}
                aria-label={tc("zoomIn")}
                title={tc("zoomIn")}
                className={CONTROL_BUTTON}
              >
                <ZoomIcon plus />
              </button>
              <button
                type="button"
                onClick={() => gestures.zoomBy(1 / BUTTON_ZOOM, null, false)}
                aria-label={tc("zoomOut")}
                title={tc("zoomOut")}
                className={`${CONTROL_BUTTON} border-t border-border-subtle`}
              >
                <ZoomIcon plus={false} />
              </button>
            </div>
          </div>
        </div>
        <div className="mt-2">
          <button
            type="button"
            disabled={atLimit}
            onClick={addAtViewCentre}
            className="mt-2 w-full rounded-md border border-border-subtle px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            {t("addByKeyboard")}
          </button>
          <p className="mt-2 text-xs text-muted-foreground">{t("tapHint")}</p>
          <div className="mt-4 max-w-xl">
            <label
              htmlFor={`${baseId}-link`}
              className="block text-sm font-medium"
            >
              {t("linkField")}
            </label>
            <div className="mt-1 flex gap-2">
              <input
                id={`${baseId}-link`}
                type="url"
                inputMode="url"
                autoComplete="off"
                value={link}
                disabled={atLimit}
                placeholder={t("linkPlaceholder")}
                aria-describedby={`${baseId}-link-help ${baseId}-link-status`}
                onChange={(e) => setLink(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void addFromLink();
                  }
                }}
                className="min-w-0 flex-1 rounded-md border border-border-subtle bg-background px-3 py-2 text-base"
              />
              <button
                type="button"
                disabled={atLimit || resolving}
                onClick={() => void addFromLink()}
                className="shrink-0 rounded-md border border-border-subtle px-3 py-2 text-sm font-medium disabled:opacity-50"
              >
                {resolving ? t("linkWorking") : t("linkButton")}
              </button>
            </div>
            <p
              id={`${baseId}-link-help`}
              className="mt-1 text-xs text-muted-foreground"
            >
              {t("linkPrivacy")}
            </p>
            <p
              id={`${baseId}-link-status`}
              aria-live="polite"
              className={`mt-1 text-xs ${linkStatus?.kind === "error" ? "text-red-700 dark:text-red-400" : "text-muted-foreground"}`}
            >
              {linkStatus?.message ?? ""}
            </p>
          </div>
          {atLimit && limitText ? (
            <p className="mt-1 text-xs text-muted-foreground">{limitText}</p>
          ) : null}
        </div>

        <div className="mt-6 min-w-0">
          {stops.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <ol className="grid items-start gap-3 md:grid-cols-2">
              {stops.map((stop, i) =>
                stop.parentKey ? null : (
                  <li key={stop.key} className="min-w-0">
                    {renderCard(stop, i)}
                    {subsOf(stops, stop.key).length > 0 ? (
                      <ol className="ml-3 mt-3 grid list-none gap-3 border-l-2 border-dotted border-[#2b6cb0]/50 pl-3 sm:ml-5 sm:pl-4">
                        {stops.map((sub, j) =>
                          sub.parentKey === stop.key ? (
                            <li key={sub.key}>{renderCard(sub, j)}</li>
                          ) : null,
                        )}
                      </ol>
                    ) : null}
                  </li>
                ),
              )}
            </ol>
          )}
          {anyBlankLabel ? (
            <p
              role="status"
              className="mt-3 text-sm text-amber-800 dark:text-amber-300"
            >
              {t("needsLabel")}
            </p>
          ) : null}
        </div>
      </div>
    </fieldset>
  );
}
