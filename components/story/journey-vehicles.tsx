/**
 * The two little vehicles that drive the route. Each is drawn around
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
