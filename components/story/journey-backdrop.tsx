import { useId } from "react";
import {
  getJourneyGeography,
  type JourneyCountry,
} from "@/lib/journey/geographies";
import { getMapPaths } from "@/lib/journey/map-paths";

/**
 * The shared base map (New Zealand or Malaysia) (sea, land, lakes, roads) that the
 * reader's journey map and the contributor's stop editor draw on. The
 * geometry is real (Natural Earth 1:10m, public domain; see
 * lib/journey/nz-map-data.ts), the look is "Google Maps"-style, and it is
 * still a picture: no tiles, no live location. Purely decorative SVG, always
 * rendered inside an <svg> that carries its own accessible name.
 *
 * Colours are CSS variables (--map-*, app/globals.css) with light and dark
 * values. Lines use vector-effect="non-scaling-stroke", so roads and the
 * coast keep one on-screen width however far the camera zooms in.
 */

const line = {
  fill: "none",
  vectorEffect: "non-scaling-stroke",
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

export function JourneyBackdrop({
  country = "new-zealand",
}: {
  country?: JourneyCountry;
}) {
  const clipId = useId();
  const geo = getJourneyGeography(country);
  const paths = getMapPaths(geo);
  return (
    <g aria-hidden="true">
      <defs>
        <clipPath id={clipId}>
          <path d={paths.land} />
        </clipPath>
      </defs>
      <rect
        x="0"
        y="0"
        width={geo.viewBox.width}
        height={geo.viewBox.height}
        rx="14"
        style={{ fill: "var(--map-sea)" }}
      />
      {/* Inset geographies (Malaysia): frame each panel so it reads as its own picture. */}
      {geo.panels.length > 1
        ? geo.panels.map((p) => (
            <rect
              key={`${p.x}-${p.y}`}
              data-testid="journey-panel"
              x={p.x}
              y={p.y}
              width={p.width}
              height={p.height}
              rx="6"
              style={{
                fill: "var(--map-sea)",
                stroke: "var(--map-land-stroke)",
                strokeWidth: 1,
                vectorEffect: "non-scaling-stroke",
              }}
            />
          ))
        : null}
      <path
        d={paths.land}
        data-testid="journey-land"
        style={{
          fill: "var(--map-land)",
          stroke: "var(--map-land-stroke)",
          strokeWidth: 1,
          vectorEffect: "non-scaling-stroke",
          strokeLinejoin: "round",
        }}
      />
      <path d={paths.lakes} style={{ fill: "var(--map-lake)" }} />
      <g clipPath={`url(#${clipId})`}>
        {/* Secondary roads are only drawn once the camera is zoomed in
            (journey-map's applyCamera fades [data-zoom-min]). */}
        <g data-roads="secondary" data-zoom-min="1.4" opacity="0">
          <path
            d={paths.secondaryRoads}
            {...line}
            style={{
              stroke: "var(--map-road-secondary-casing)",
              strokeWidth: 2.6,
            }}
          />
          <path
            d={paths.secondaryRoads}
            {...line}
            style={{ stroke: "var(--map-road-secondary)", strokeWidth: 1.5 }}
          />
        </g>
        <g data-roads="major">
          <path
            d={paths.majorRoads}
            {...line}
            style={{ stroke: "var(--map-road-major-casing)", strokeWidth: 3.2 }}
          />
          <path
            d={paths.majorRoads}
            {...line}
            style={{ stroke: "var(--map-road-major)", strokeWidth: 2 }}
          />
        </g>
      </g>
    </g>
  );
}
