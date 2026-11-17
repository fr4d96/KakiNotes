"use client";

import { useSyncExternalStore } from "react";
import {
  ACCENT_CSS_VARS,
  ACCENT_PRESETS,
  ACCENT_STORAGE_KEY,
  DEFAULT_ACCENT_ID,
  deriveAccentPalette,
  parseStoredPalette,
  type AccentPalette,
} from "@/lib/theme/accent";

/**
 * The reader's device preferences for how the app looks (Settings >
 * Personalize): theme and accent. Both live in localStorage on this device,
 * like they always have for the theme, and both are applied before first
 * paint by lib/theme-init-script.ts -- these stores only change them at run
 * time and let the settings screen follow along. Display only; nothing here
 * is sent anywhere.
 */

type Listener = () => void;

// ---- Theme ------------------------------------------------------------------

export type ThemePreference = "light" | "dark" | "system";

/** Same key the pre-paint script reads. */
const THEME_STORAGE_KEY = "journiq-theme";
const themeListeners = new Set<Listener>();

function readThemePreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
}

function systemTheme(): "light" | "dark" {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function setThemePreference(next: ThemePreference) {
  try {
    if (next === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // Private browsing / storage off: still apply it for this visit.
  }
  document.documentElement.dataset.theme =
    next === "system" ? systemTheme() : next;
  themeListeners.forEach((listener) => listener());
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(
    (listener) => {
      themeListeners.add(listener);
      return () => themeListeners.delete(listener);
    },
    readThemePreference,
    () => "system",
  );
}

// ---- Accent -----------------------------------------------------------------

/** Which swatch is chosen: a preset by id, or a custom colour. */
export type AccentChoice =
  { kind: "preset"; id: string } | { kind: "custom"; hex: string };

const accentListeners = new Set<Listener>();
let accentSnapshot: { raw: string | null; choice: AccentChoice } | null = null;

function choiceFor(palette: AccentPalette | null): AccentChoice {
  if (!palette) return { kind: "preset", id: DEFAULT_ACCENT_ID };
  const preset = ACCENT_PRESETS.find(
    (p) => p.hex.toLowerCase() === palette.source.toLowerCase(),
  );
  return preset
    ? { kind: "preset", id: preset.id }
    : { kind: "custom", hex: palette.source };
}

function readAccentChoice(): AccentChoice {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(ACCENT_STORAGE_KEY);
  } catch {
    raw = null;
  }
  // useSyncExternalStore needs a stable snapshot between changes.
  if (!accentSnapshot || accentSnapshot.raw !== raw) {
    accentSnapshot = { raw, choice: choiceFor(parseStoredPalette(raw)) };
  }
  return accentSnapshot.choice;
}

const SERVER_CHOICE: AccentChoice = { kind: "preset", id: DEFAULT_ACCENT_ID };

/** Puts a palette on <html> now (or removes it for the default). */
export function applyAccentPalette(palette: AccentPalette | null) {
  const style = document.documentElement.style;
  for (const theme of ["light", "dark"] as const) {
    for (const key of ["accent", "tagForeground", "tagBackground"] as const) {
      const property = ACCENT_CSS_VARS[theme][key];
      if (palette) style.setProperty(property, palette[theme][key]);
      else style.removeProperty(property);
    }
  }
}

/**
 * Chooses the accent: applies it at once and remembers it on this device.
 * The default (Kingfisher) is stored as nothing at all, so the app's own
 * tokens apply.
 */
export function setAccentColor(hex: string | null) {
  const palette =
    hex && hex.toLowerCase() !== presetHex(DEFAULT_ACCENT_ID)
      ? deriveAccentPalette(hex)
      : null;
  applyAccentPalette(palette);
  try {
    if (palette) {
      localStorage.setItem(ACCENT_STORAGE_KEY, JSON.stringify(palette));
    } else localStorage.removeItem(ACCENT_STORAGE_KEY);
  } catch {
    // Applied for this visit even when it cannot be remembered.
  }
  accentListeners.forEach((listener) => listener());
}

export function presetHex(id: string): string {
  return ACCENT_PRESETS.find((p) => p.id === id)?.hex.toLowerCase() ?? "";
}

export function useAccentChoice(): AccentChoice {
  return useSyncExternalStore(
    (listener) => {
      accentListeners.add(listener);
      return () => accentListeners.delete(listener);
    },
    readAccentChoice,
    () => SERVER_CHOICE,
  );
}
