/**
 * The little vehicles (campervan, ferry, plane) that drive the route. Each is drawn around
 * (0, 0), about 18 units wide, facing right; the map flips/rotates the
 * wrapping <g>. Decorative only (aria-hidden by the caller's wrapper).
 */
export function Campervan({
  testId = "journey-campervan",
}: {
  testId?: string | null;
}) {
  return (
    <g data-testid={testId ?? undefined}>
      {/* surfboard on the roof */}
      <rect x="-6" y="-9.6" width="11" height="1.8" rx="0.9" fill="#ff9aa8" />
      {/* body */}
      <rect x="-9" y="-7.5" width="18" height="11" rx="3" fill="#8fd3c2" />
      <rect x="-9" y="-1" width="18" height="2" fill="#fff4d6" />
      {/* windows */}
      <rect x="-6.5" y="-5.6" width="5" height="4" rx="1" fill="#f4fbff" />
      <rect x="-0.5" y="-5.6" width="4" height="4" rx="1" fill="#f4fbff" />
      <path d="M5 -5.6h2.2a1.4 1.4 0 0 1 1.3 1l.6 3H5z" fill="#f4fbff" />
      {/* headlight */}
      <circle cx="8.4" cy="1.6" r="0.9" fill="#ffd966" />
      {/* wheels */}
      <circle cx="-4.6" cy="3.6" r="2.3" fill="#5b6770" />
      <circle cx="-4.6" cy="3.6" r="0.9" fill="#e6eef2" />
      <circle cx="4.6" cy="3.6" r="2.3" fill="#5b6770" />
      <circle cx="4.6" cy="3.6" r="0.9" fill="#e6eef2" />
    </g>
  );
}

export function Ferry({
  testId = "journey-ferry",
}: {
  testId?: string | null;
}) {
  return (
    <g data-testid={testId ?? undefined}>
      {/* funnel */}
      <rect x="-1.5" y="-10.5" width="4" height="4.5" rx="0.8" fill="#ff9aa8" />
      <rect x="-1.5" y="-8.4" width="4" height="1" fill="#fff4d6" />
      {/* cabin */}
      <rect x="-6.5" y="-6.5" width="12" height="4" rx="1.2" fill="#fff4d6" />
      <circle cx="-3.5" cy="-4.5" r="0.9" fill="#8fc7e8" />
      <circle cx="-0.5" cy="-4.5" r="0.9" fill="#8fc7e8" />
      <circle cx="2.5" cy="-4.5" r="0.9" fill="#8fc7e8" />
      {/* hull */}
      <path d="M-10 -2.5h19l-3 6.5h-13z" fill="#5fa8d3" />
      <path d="M-9 0h17" stroke="#fff4d6" strokeWidth="0.9" />
      {/* waves */}
      <path
        d="M-11 5.4q2-1.8 4 0t4 0 4 0 4 0 4 0"
        fill="none"
        stroke="#ffffff"
        strokeWidth="1"
        strokeLinecap="round"
      />
    </g>
  );
}

/** A small airliner for crossings that are flights (Peninsular <-> Borneo). */
export function Plane({
  testId = "journey-plane",
}: {
  testId?: string | null;
}) {
  return (
    <g data-testid={testId ?? undefined}>
      {/* far wing */}
      <path d="M-1.5 -1.2l-4.5 -6.2h2.6l5.2 6.2z" fill="#b9dff2" />
      {/* tail fin */}
      <path d="M-9.5 -1.2l-1.2 -5.6h2.6l2.6 5.6z" fill="#ff9aa8" />
      {/* fuselage */}
      <path
        d="M-10 -0.5q0 -2.4 2.6 -2.4h12.4q4.6 0 5.4 2.4q-0.8 2.4 -5.4 2.4h-12.4q-2.6 0 -2.6 -2.4z"
        fill="#fff4d6"
      />
      <path d="M-9 0.6h17.6" stroke="#5fa8d3" strokeWidth="0.9" />
      {/* windows and cockpit */}
      <circle cx="-4.5" cy="-1.1" r="0.7" fill="#8fc7e8" />
      <circle cx="-1.8" cy="-1.1" r="0.7" fill="#8fc7e8" />
      <circle cx="0.9" cy="-1.1" r="0.7" fill="#8fc7e8" />
      <path d="M5.2 -2.4q2.2 0 3.2 1.4h-3.2z" fill="#8fc7e8" />
      {/* near wing */}
      <path d="M-1.5 0.6l-5 7h2.8l6.2 -7z" fill="#8fd3c2" />
    </g>
  );
}
