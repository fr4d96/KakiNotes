import { afterEach, describe, expect, it, vi } from "vitest";
import { themeInitScript } from "./theme-init-script";

function runAs(navigationType: string | null) {
  vi.spyOn(performance, "getEntriesByType").mockReturnValue(
    navigationType
      ? [{ type: navigationType } as unknown as PerformanceEntry]
      : [],
  );
  new Function(themeInitScript)();
}

afterEach(() => {
  vi.restoreAllMocks();
  delete document.documentElement.dataset.splash;
  delete document.documentElement.dataset.theme;
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
});
