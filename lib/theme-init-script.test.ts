import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { themeInitScript } from "./theme-init-script";
import { deriveAccentPalette } from "./theme/accent";

function runAs(navigationType: string | null) {
  vi.spyOn(performance, "getEntriesByType").mockReturnValue(
    navigationType
      ? [{ type: navigationType } as unknown as PerformanceEntry]
      : [],
  );
  new Function(themeInitScript)();
}

// This test environment provides no localStorage, so stub a minimal
// in-memory one (same pattern as my-stories-view.test.tsx).
let store: Record<string, string> = {};

beforeEach(() => {
  store = {};
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  delete document.documentElement.dataset.splash;
  delete document.documentElement.dataset.theme;
  document.documentElement.removeAttribute("style");
});

describe("themeInitScript", () => {
  it("sets the theme before first paint", () => {
    runAs("navigate");
    expect(document.documentElement.dataset.theme).toMatch(/^(light|dark)$/);
  });

  it("skips the launch splash on a reload (pull to refresh)", () => {
    runAs("reload");
    expect(document.documentElement.dataset.splash).toBe("skip");
  });

  it("keeps the splash for a normal launch", () => {
    runAs("navigate");
    expect(document.documentElement.dataset.splash).toBeUndefined();
  });

  it("keeps the splash when the browser can't say how the page was opened", () => {
    runAs(null);
    expect(document.documentElement.dataset.splash).toBeUndefined();
  });

  it("applies the reader's saved accent before first paint", () => {
    localStorage.setItem(
      "kakinotes-accent",
      JSON.stringify(deriveAccentPalette("#2747d8")),
    );
    runAs("navigate");
    const style = document.documentElement.style;
    expect(style.getPropertyValue("--user-accent-light")).toMatch(/^#/);
    expect(style.getPropertyValue("--user-accent-dark")).toMatch(/^#/);
  });

  it("ignores a tampered saved accent", () => {
    const palette = deriveAccentPalette("#2747d8")!;
    localStorage.setItem(
      "kakinotes-accent",
      JSON.stringify({
        ...palette,
        dark: { ...palette.dark, accent: "red;background:url(x)" },
      }),
    );
    runAs("navigate");
    expect(
      document.documentElement.style.getPropertyValue("--user-accent-light"),
    ).toBe("");
  });
});
