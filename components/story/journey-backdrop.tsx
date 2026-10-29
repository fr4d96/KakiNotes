import { useId } from "react";
import { JOURNEY_VIEWBOX } from "@/lib/journey/geo";
import { getMapPaths } from "@/lib/journey/map-paths";

/**
 * The shared New Zealand base map (sea, land, lakes, roads) that the
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

export function JourneyBackdrop() {
  const clipId = useId();
  const paths = getMapPaths();
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
        width={JOURNEY_VIEWBOX.width}
        height={JOURNEY_VIEWBOX.height}
        rx="14"
        style={{ fill: "var(--map-sea)" }}
      />
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
