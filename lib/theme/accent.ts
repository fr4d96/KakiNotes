/**
 * Personal accent colours (2026-11-17): a reader may pick ANY colour as the
 * app's accent (Settings > Personalize), and it must still read in both
 * themes. This module turns one picked colour into the accent set each
 * theme needs, keeping the colour's hue (and as much of its chroma as the
 * screen can show) and moving only its LIGHTNESS -- in OKLCH, where
 * lightness tracks what the eye sees -- until it lands on a fixed contrast
 * against that theme's ground:
 *
 *   light: the accent is text on the warm-gray ground and a fill under
 *          WHITE text, so it is pushed darker (target 5.3:1);
 *   dark:  the accent is text on the charcoal ground and a fill under the
 *          DARK ink, so it is pushed brighter (target 7.6:1 -- dark-adapted
 *          eyes like more, and it is what keeps it luminous, not pastel).
 *
 * Both targets are what the default, Kingfisher, already measures, so every
 * colour lands with the same visual weight as the default, and every one
 * clears WCAG AA (4.5:1) with margin -- including on the recess. Tags get a
 * deeper / paler ink tuned against their own wash.
 *
 * Pure functions, no DOM: the settings screen derives with it, and the
 * result is stored, so the pre-paint script (lib/theme-init-script.ts) only
 * ever reads finished values.
 */

export type AccentSet = {
  /** --accent: text, fills, rings. */
  accent: string;
  /** --tag-foreground: ink on the tag wash. */
  tagForeground: string;
  /** --tag-background: the accent at low alpha. */
  tagBackground: string;
};

export type AccentPalette = {
  /** The colour the reader picked, as they picked it. */
  source: string;
  light: AccentSet;
  dark: AccentSet;
};

/** The app's grounds, from app/globals.css. */
export const GROUNDS = {
  light: { ground: "#f2f0ec", recess: "#e7e4df", onAccent: "#ffffff" },
  dark: { ground: "#1c1a18", recess: "#302d29", onAccent: "#1c1a18" },
} as const;

const TARGET = { light: 5.3, dark: 7.6 } as const;
const TAG_TARGET = { light: 6.4, dark: 8.2 } as const;
const TAG_ALPHA = { light: 0.1, dark: 0.15 } as const;
/** Every derived accent clears this on the ground AND the recess. */
export const MIN_CONTRAST = 4.5;

// ---- sRGB <-> OKLab <-> OKLCH ---------------------------------------------

type RGB = [number, number, number];

export function parseHex(hex: string): RGB | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function toHex([r, g, b]: RGB): string {
  const c = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

const toLinear = (c: number) =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const fromLinear = (c: number) =>
  c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;

function rgbToOklch(rgb: RGB): [number, number, number] {
  const [r, g, b] = rgb.map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.hypot(A, B);
  const H = C < 1e-6 ? 0 : ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
  return [L, C, H];
}

/** OKLCH -> linear-free sRGB, unclamped (may be out of gamut). */
function oklchToRgbRaw(L: number, C: number, H: number): RGB {
  const h = (H * Math.PI) / 180;
  const A = C * Math.cos(h);
  const B = C * Math.sin(h);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

const inGamut = (rgb: RGB) => rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4);

/** The colour at this lightness and hue, with chroma pulled in to fit sRGB. */
function oklchToRgb(L: number, C: number, H: number): RGB {
  let rgb = oklchToRgbRaw(L, C, H);
  if (inGamut(rgb)) return rgb;
  let lo = 0;
  let hi = C;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    rgb = oklchToRgbRaw(L, mid, H);
    if (inGamut(rgb)) lo = mid;
    else hi = mid;
  }
  return oklchToRgbRaw(L, lo, H);
}

// ---- WCAG contrast -----------------------------------------------------------

export function luminance(rgb: RGB): number {
  const [r, g, b] = rgb.map((c) => toLinear(Math.min(1, Math.max(0, c))));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string | RGB, b: string | RGB): number {
  const ra = typeof a === "string" ? parseHex(a) : a;
  const rb = typeof b === "string" ? parseHex(b) : b;
  if (!ra || !rb) return 1;
  const la = luminance(ra);
  const lb = luminance(rb);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** `fg` at `alpha` over `bg`, as an opaque colour. */
function over(fg: RGB, alpha: number, bg: RGB): RGB {
  return [0, 1, 2].map((i) => fg[i] * alpha + bg[i] * (1 - alpha)) as RGB;
}

// ---- Derivation ------------------------------------------------------------

/**
 * The lightness (same hue and chroma) whose contrast against `against` is
 * `target`, going darker than it ("down") or brighter ("up"). Bisection:
 * contrast is monotonic in OKLCH lightness on either side of the ground.
 */
function toneAt(
  C: number,
  H: number,
  against: RGB,
  target: number,
  direction: "down" | "up",
): RGB {
  let lo = 0;
  let hi = 1;
  let best = oklchToRgb(direction === "down" ? 0 : 1, C, H);
  for (let i = 0; i < 32; i++) {
    const mid = (lo + hi) / 2;
    const rgb = oklchToRgb(mid, C, H);
    const ratio = contrast(rgb, against);
    const enough = ratio >= target;
    if (direction === "down") {
      // Darker raises contrast: find the LIGHTEST tone that is enough.
      if (enough) {
        best = rgb;
        lo = mid;
      } else hi = mid;
    } else if (enough) {
      // Brighter raises contrast: find the DARKEST tone that is enough.
      best = rgb;
      hi = mid;
    } else lo = mid;
  }
  return best;
}

function deriveSet(C: number, H: number, theme: "light" | "dark"): AccentSet {
  const { ground, recess } = GROUNDS[theme];
  const groundRgb = parseHex(ground)!;
  const recessRgb = parseHex(recess)!;
  const direction = theme === "light" ? "down" : "up";

  let accent = toneAt(C, H, groundRgb, TARGET[theme], direction);
  // The recess is the tightest pairing; nudge further if it falls short.
  if (contrast(accent, recessRgb) < MIN_CONTRAST) {
    accent = toneAt(C, H, recessRgb, MIN_CONTRAST + 0.05, direction);
  }

  const wash = over(accent, TAG_ALPHA[theme], groundRgb);
  const tagInk = toneAt(C, H, wash, TAG_TARGET[theme], direction);
  const [r, g, b] = accent.map((v) => Math.round(v * 255));

  return {
    accent: toHex(accent),
    tagForeground: toHex(tagInk),
    tagBackground: `rgba(${r}, ${g}, ${b}, ${TAG_ALPHA[theme]})`,
  };
}

/** One picked colour -> the accent set for each theme. Null for bad input. */
export function deriveAccentPalette(hex: string): AccentPalette | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const [, C, H] = rgbToOklch(rgb);
  return {
    source: toHex(rgb),
    light: deriveSet(C, H, "light"),
    dark: deriveSet(C, H, "dark"),
  };
}

// ---- Presets ------------------------------------------------------------------

/**
 * The swatches Settings offers before "Custom". Kingfisher is the default
 * and is the app's own token values (no override is stored for it); the
 * rest are derived like any picked colour. Names are message keys under
 * settings.accent.presets.
 */
export const DEFAULT_ACCENT_ID = "kingfisher";
export const ACCENT_PRESETS = [
  { id: "kingfisher", hex: "#0068a3" },
  { id: "cobalt", hex: "#2747d8" },
  { id: "grape", hex: "#7b3fbf" },
  { id: "rose", hex: "#c2375b" },
  { id: "pohutukawa", hex: "#c8102e" },
  { id: "ember", hex: "#d9622b" },
  { id: "fern", hex: "#2f7d3b" },
] as const;

export type AccentPresetId = (typeof ACCENT_PRESETS)[number]["id"];

// ---- Storage shape ---------------------------------------------------------

/** localStorage key; read by lib/theme-init-script.ts before first paint. */
export const ACCENT_STORAGE_KEY = "kakinotes-accent";

/** The CSS custom properties app/globals.css reads, per theme. */
export const ACCENT_CSS_VARS = {
  light: {
    accent: "--user-accent-light",
    tagForeground: "--user-tag-fg-light",
    tagBackground: "--user-tag-bg-light",
  },
  dark: {
    accent: "--user-accent-dark",
    tagForeground: "--user-tag-fg-dark",
    tagBackground: "--user-tag-bg-dark",
  },
} as const;

const HEX = /^#[0-9a-f]{6}$/i;
const RGBA = /^rgba\(\d{1,3}, \d{1,3}, \d{1,3}, 0?\.\d{1,3}\)$/;

/**
 * A stored palette, validated field by field -- localStorage is the
 * visitor's to edit, and these values end up in style properties.
 */
export function parseStoredPalette(raw: string | null): AccentPalette | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as AccentPalette;
    const okSet = (set: AccentSet | undefined) =>
      !!set &&
      HEX.test(set.accent) &&
      HEX.test(set.tagForeground) &&
      RGBA.test(set.tagBackground);
    if (!HEX.test(value?.source) || !okSet(value.light) || !okSet(value.dark))
      return null;
    return value;
  } catch {
    return null;
  }
}
