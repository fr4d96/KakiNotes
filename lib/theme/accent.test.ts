import { describe, expect, it } from "vitest";
import {
  ACCENT_PRESETS,
  GROUNDS,
  MIN_CONTRAST,
  contrast,
  deriveAccentPalette,
  parseHex,
  parseStoredPalette,
} from "./accent";

// Picks that are hard to make readable: too light, too dark, no hue at all,
// and the screen's most saturated corners.
const HARD_PICKS = [
  "#ffff00",
  "#ffffff",
  "#000000",
  "#808080",
  "#39ff14",
  "#ff00ff",
  "#00ffff",
  "#ff0000",
  "#0000ff",
  "#f5e6c8",
];

function washOver(rgba: string, ground: string): string {
  const m = /^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/.exec(rgba)!;
  const a = Number(m[4]);
  const g = parseHex(ground)!;
  const mix = [1, 2, 3].map((i, k) =>
    Math.round((Number(m[i]) / 255) * a * 255 + g[k] * (1 - a) * 255),
  );
  return `#${mix.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

describe("deriveAccentPalette", () => {
  const picks = [...ACCENT_PRESETS.map((p) => p.hex), ...HARD_PICKS];

  it.each(picks)(
    "keeps %s readable in both themes (text, fills, recess, tags)",
    (hex) => {
      const palette = deriveAccentPalette(hex)!;
      for (const theme of ["light", "dark"] as const) {
        const { ground, recess, onAccent } = GROUNDS[theme];
        const set = palette[theme];
        expect(contrast(set.accent, ground)).toBeGreaterThanOrEqual(
          MIN_CONTRAST,
        );
        expect(contrast(set.accent, recess)).toBeGreaterThanOrEqual(
          MIN_CONTRAST,
        );
        expect(contrast(onAccent, set.accent)).toBeGreaterThanOrEqual(
          MIN_CONTRAST,
        );
        const wash = washOver(set.tagBackground, ground);
        expect(contrast(set.tagForeground, wash)).toBeGreaterThanOrEqual(
          MIN_CONTRAST,
        );
      }
    },
  );

  it("lands the default, Kingfisher, on (nearly) its own token values", () => {
    const palette = deriveAccentPalette("#0068a3")!;
    // Same weight as the hand-tuned tokens: within a hair of 5.26:1 / 7.59:1.
    expect(contrast(palette.light.accent, GROUNDS.light.ground)).toBeCloseTo(
      5.3,
      1,
    );
    expect(contrast(palette.dark.accent, GROUNDS.dark.ground)).toBeCloseTo(
      7.6,
      1,
    );
  });

  it("rejects anything that is not a 6-digit hex colour", () => {
    expect(deriveAccentPalette("blue")).toBeNull();
    expect(deriveAccentPalette("#12345")).toBeNull();
  });
});

describe("parseStoredPalette", () => {
  it("round-trips a derived palette", () => {
    const palette = deriveAccentPalette("#2747d8")!;
    expect(parseStoredPalette(JSON.stringify(palette))).toEqual(palette);
  });

  it("refuses edited or broken storage instead of styling with it", () => {
    const palette = deriveAccentPalette("#2747d8")!;
    const tampered = {
      ...palette,
      light: { ...palette.light, accent: "red; background: url(x)" },
    };
    expect(parseStoredPalette(JSON.stringify(tampered))).toBeNull();
    expect(parseStoredPalette("{not json")).toBeNull();
    expect(parseStoredPalette(null)).toBeNull();
  });
});

it("prints the presets for review", () => {
  const rows = ACCENT_PRESETS.map((p) => {
    const d = deriveAccentPalette(p.hex)!;
    return `${p.id.padEnd(11)} light ${d.light.accent} (${contrast(d.light.accent, GROUNDS.light.ground).toFixed(2)}) tag ${d.light.tagForeground} | dark ${d.dark.accent} (${contrast(d.dark.accent, GROUNDS.dark.ground).toFixed(2)}) tag ${d.dark.tagForeground}`;
  });
  console.log("\n" + rows.join("\n"));
});
