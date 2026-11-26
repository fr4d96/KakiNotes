"use client";

import {
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { useTranslations } from "next-intl";
import {
  MAX_JOURNEY_LABEL_LENGTH,
  isInsidePanels,
  latLngToPoint,
  pointToLatLng,
  roundCoordinate,
} from "@/lib/journey/geo";
import {
  getJourneyGeography,
  isInsideCountry,
  type JourneyCountry,
} from "@/lib/journey/geographies";
import { parseGoogleMapsUrl } from "@/lib/journey/google-maps-link";
import type { ResolveLinkResult } from "@/lib/journey/resolve-google-maps-link";
import { FULL_BOX, type CameraBox } from "@/lib/journey/camera";
import { resolveGoogleMapsLinkAction } from "@/app/(contributor)/my-stories/journey/actions";
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

/**
 * Picks ONE place on the picture of New Zealand: tap the map, press the
 * "use the middle of the map" button (keyboard / screen-reader route), nudge
 * the pin with the arrow keys, or paste a Google Maps link. Controlled and
 * presentational: the parent owns the point and the place name and saves via
 * a server action. The authoritative rounding and New Zealand bounds check is
 * set_story_journey_place(); everything here is a convenience.
 */

export type PickedPoint = { latitude: number; longitude: number };

export type ResolveLink = (
  input: string,
  country?: JourneyCountry,
) => Promise<ResolveLinkResult | { ok: false; reason: "unauthenticated" }>;

type LinkStatus = { kind: "error" | "success"; message: string } | null;

const NUDGE_DEGREES = 0.25;
/** Picking needs accuracy, so it zooms further than the reader map. */
const PICKER_MAX_ZOOM = 12;
/** Marker size in full-view SVG units; drawn at 1/zoom so it keeps its size. */
const PIN_R = 4.6;
const PIN_HIT_R = 10;

/** Cap to the label limit without splitting a surrogate pair. */
export function capPlaceName(name: string): string {
  let out = name.trim().slice(0, MAX_JOURNEY_LABEL_LENGTH);
  const last = out.charCodeAt(out.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) out = out.slice(0, -1);
  return out.trim();
}

export function JourneyPlacePicker({
  value,
  onChange,
  resolveLink = resolveGoogleMapsLinkAction,
  country = "new-zealand",
}: {
  value: PickedPoint | null;
  /** `placeName` is set only when a pasted link carried one. */
  onChange: (point: PickedPoint, placeName?: string) => void;
  /** Resolves a short Google Maps link on the server. Overridable for tests. */
  resolveLink?: ResolveLink;
  /** Which country's picture to draw and accept places in. */
  country?: JourneyCountry;
}) {
  const geo = getJourneyGeography(country);
  const t = useTranslations("journey.picker");
  const tc = useTranslations("journey.controls");
  const baseId = useId();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const cam = useRef<CameraBox>({ ...FULL_BOX });
  const point = value ? latLngToPoint(value, geo) : null;
  const pointRef = useRef(point);

  const applyCamera = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const c = cam.current;
    const k = fmt(c.w / geo.viewBox.width);
    svg.setAttribute("viewBox", boxAttr(c));
    svg.querySelectorAll<SVGGElement>("[data-pin]").forEach((g) => {
      g.setAttribute(
        "transform",
        `translate(${g.dataset.px} ${g.dataset.py}) scale(${k})`,
      );
    });
    applyMapDetail(svg, k, pointRef.current ? [pointRef.current] : []);
  }, [geo.viewBox.width]);
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
    maxZoom: PICKER_MAX_ZOOM,
    doubleZoom: false,
  });
  // React may have just re-rendered the marker at its base transform: put the
  // current camera's scaling back before the browser paints.
  useLayoutEffect(() => {
    pointRef.current = point;
    applyCamera();
  });

  const [link, setLink] = useState("");
  const [resolving, setResolving] = useState(false);
  const [linkStatus, setLinkStatus] = useState<LinkStatus>(null);

  function handleMapClick(event: MouseEvent<SVGSVGElement>) {
    // A drag, pinch or swipe moves the map; only a plain tap picks a place.
    if (gestures.wasGesture()) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    // Through the CURRENT viewBox (zoom, pan, letterboxing) back to lat/lng.
    const at = gestures.toSvgPoint(event.clientX, event.clientY, cam.current);
    // The sea margin around the picture (and the sea between Malaysia's two
    // panels) is not part of the country.
    if (!isInsidePanels(at, geo)) return;
    const picked = pointToLatLng(at, geo);
    if (!isInsideCountry(geo, picked)) return;
    onChange(picked);
  }

  function pickViewCentre() {
    const c = cam.current;
    const centre = { x: c.x + c.w / 2, y: c.y + c.h / 2 };
    const picked = pointToLatLng(centre, geo);
    const first = geo.panels[0].bounds;
    onChange(
      isInsidePanels(centre, geo) && isInsideCountry(geo, picked)
        ? picked
        : { latitude: first.maxLat, longitude: first.minLng },
    );
  }

  function pinKeyDown(event: KeyboardEvent<SVGGElement>) {
    if (!value) return;
    const delta: Record<string, [number, number]> = {
      ArrowUp: [NUDGE_DEGREES, 0],
      ArrowDown: [-NUDGE_DEGREES, 0],
      ArrowLeft: [0, -NUDGE_DEGREES],
      ArrowRight: [0, NUDGE_DEGREES],
    };
    const d = delta[event.key];
    if (!d) return;
    event.preventDefault();
    const { bounds } = geo;
    const next = {
      latitude: roundCoordinate(
        Math.min(bounds.maxLat, Math.max(bounds.minLat, value.latitude + d[0])),
      ),
      longitude: roundCoordinate(
        Math.min(
          bounds.maxLng,
          Math.max(bounds.minLng, value.longitude + d[1]),
        ),
      ),
    };
    // Malaysia: the sea between the two panels is not part of the picture.
    if (isInsideCountry(geo, next)) onChange(next);
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

  async function pickFromLink() {
    const input = link.trim();
    if (resolving) return;
    if (input === "") {
      setLinkStatus({ kind: "error", message: t("linkErrors.empty") });
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
        const result = await resolveLink(input, country);
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

    if (!isInsideCountry(geo, place)) {
      setLinkStatus({ kind: "error", message: t("linkErrors.outsideNz") });
      return;
    }
    const name = place.placeName ? capPlaceName(place.placeName) : "";
    onChange(
      { latitude: place.latitude, longitude: place.longitude },
      name || undefined,
    );
    setLink("");
    setLinkStatus({
      kind: "success",
      message: name ? t("linkUsed", { name }) : t("linkUsedNoName"),
    });
  }

  return (
    <div data-testid="journey-place-picker">
      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${geo.viewBox.width} ${geo.viewBox.height}`}
          role="group"
          aria-label={t("mapLabel")}
          aria-describedby={`${baseId}-help`}
          tabIndex={0}
          // One finger keeps scrolling the page; pinch / two-finger drag and
          // mouse drag move the map.
          style={{ touchAction: "pan-y", background: "var(--map-sea)" }}
          {...gestures.handlers}
          onKeyDown={(e) => {
            // Arrow keys on the focused pin nudge the pin, not the map.
            if (e.target === e.currentTarget) gestures.handlers.onKeyDown(e);
          }}
          onClick={handleMapClick}
          className="block h-auto max-h-[min(70vh,640px)] w-full cursor-crosshair select-none rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:h-[min(70vh,640px)]"
          data-testid="journey-picker-map"
        >
          <JourneyBackdrop country={country} />
          <JourneyCities country={country} />
          {point && value ? (
            <g
              data-pin=""
              data-px={point.x}
              data-py={point.y}
              transform={`translate(${point.x} ${point.y})`}
              role="button"
              tabIndex={0}
              aria-label={t("pinLabel")}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={pinKeyDown}
              className="cursor-pointer outline-none [&:focus-visible>circle]:stroke-[#2b6cb0] [&:focus-visible>circle]:stroke-[2.5]"
            >
              <circle r={PIN_HIT_R} fill="transparent" />
              <circle
                r={PIN_R}
                fill="#ffb3c0"
                stroke="#ffffff"
                strokeWidth="1.2"
                pointerEvents="none"
              />
            </g>
          ) : null}
        </svg>
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

      <button
        type="button"
        onClick={pickViewCentre}
        className="mt-2 w-full rounded-md border border-border-subtle px-3 py-2 text-sm font-medium"
      >
        {t("useCentre")}
      </button>
      <p className="mt-2 text-xs text-muted-foreground">{t("tapHint")}</p>

      <div className="mt-4 max-w-xl">
        <label htmlFor={`${baseId}-link`} className="block text-sm font-medium">
          {t("linkField")}
        </label>
        <div className="mt-1 flex gap-2">
          <input
            id={`${baseId}-link`}
            type="url"
            inputMode="url"
            autoComplete="off"
            value={link}
            placeholder={t("linkPlaceholder")}
            aria-describedby={`${baseId}-link-help ${baseId}-link-status`}
            onChange={(e) => setLink(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void pickFromLink();
              }
            }}
            className="min-w-0 flex-1 rounded-md border border-border-subtle bg-background px-3 py-2 text-base"
          />
          <button
            type="button"
            disabled={resolving}
            onClick={() => void pickFromLink()}
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
    </div>
  );
}
