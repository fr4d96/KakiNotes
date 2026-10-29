import { latLngToPoint } from "@/lib/journey/geo";
import {
  CITIES,
  CITY_DOT_R,
  CITY_FONT,
  cityLabelRect,
  cityTextX,
} from "@/lib/journey/cities";

/**
 * Small grey city dots and names, in the Google-Maps manner (dark grey text
 * with a halo). Decorative only (aria-hidden, no pointer events): the real
 * content is the stops and the timeline. Each city is drawn at 1/zoom by the
 * map's applyCamera(), which also fades tier 2 in and hides a name that a
 * stop or the name chip would cover; `data-*` carries what it needs.
 * With `revealAll` (the editor, which never zooms) every tier is drawn.
 */
export function JourneyCities({ revealAll = false }: { revealAll?: boolean }) {
  return (
    <g aria-hidden="true" pointerEvents="none" data-testid="journey-cities">
      {CITIES.map((city) => {
        const p = latLngToPoint(city);
        const rect = cityLabelRect(city);
        const font = CITY_FONT[city.tier];
        return (
          <g
            key={city.name}
            data-city=""
            data-tier={city.tier}
            data-px={p.x.toFixed(2)}
            data-py={p.y.toFixed(2)}
            data-rect={`${rect.x0.toFixed(2)} ${rect.y0.toFixed(2)} ${rect.x1.toFixed(2)} ${rect.y1.toFixed(2)}`}
            transform={`translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})`}
            opacity={city.tier === 2 && !revealAll ? 0 : undefined}
          >
            <circle
              r={CITY_DOT_R}
              style={{
                fill: "var(--map-city-dot)",
                stroke: "var(--map-label-halo)",
                strokeWidth: 0.6,
              }}
            />
            <text
              x={cityTextX(city)}
              textAnchor={city.side === "right" ? "start" : "end"}
              dominantBaseline="central"
              fontSize={font}
              fontWeight={city.tier === 1 ? 600 : 500}
              strokeLinejoin="round"
              style={{
                fill: "var(--map-label)",
                stroke: "var(--map-label-halo)",
                strokeWidth: font * 0.38,
                paintOrder: "stroke",
              }}
            >
              {city.name}
            </text>
          </g>
        );
      })}
    </g>
  );
}
