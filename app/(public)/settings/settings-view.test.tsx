import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/i18n/set-locale-action", () => ({
  setLocaleAction: vi.fn(async (locale: string) => ({ ok: true, locale })),
}));

import { setLocaleAction } from "@/lib/i18n/set-locale-action";
import { SettingsView } from "./settings-view";

const html = document.documentElement;

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

beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }));
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  html.removeAttribute("style");
  delete html.dataset.theme;
  refresh.mockClear();
});

describe("SettingsView", () => {
  it("applies and remembers a preset accent, and goes back to Kingfisher", () => {
    render(<SettingsView locale="en" />);
    fireEvent.click(screen.getByRole("radio", { name: "Cobalt" }));

    expect(screen.getByRole("radio", { name: "Cobalt" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(html.style.getPropertyValue("--user-accent-light")).toMatch(/^#/);
    expect(JSON.parse(localStorage.getItem("kakinotes-accent")!).source).toBe(
      "#2747d8",
    );

    fireEvent.click(screen.getByRole("button", { name: "Back to Kingfisher" }));
    expect(localStorage.getItem("kakinotes-accent")).toBeNull();
    expect(html.style.getPropertyValue("--user-accent-light")).toBe("");
    expect(screen.getByRole("radio", { name: "Kingfisher" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("takes any colour from the picker", () => {
    render(<SettingsView locale="en" />);
    fireEvent.change(screen.getByLabelText("Pick any colour"), {
      target: { value: "#ffcc00" },
    });
    expect(JSON.parse(localStorage.getItem("kakinotes-accent")!).source).toBe(
      "#ffcc00",
    );
    expect(screen.getByLabelText("Pick any colour")).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("switches theme, and back to following the device", () => {
    render(<SettingsView locale="en" />);
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(html.dataset.theme).toBe("dark");
    expect(localStorage.getItem("journiq-theme")).toBe("dark");

    fireEvent.click(screen.getByRole("radio", { name: "Match device" }));
    expect(localStorage.getItem("journiq-theme")).toBeNull();
    expect(html.dataset.theme).toBe("light");
  });

  it("switches language and redraws the page in it", async () => {
    render(<SettingsView locale="en" />);
    fireEvent.click(screen.getByRole("radio", { name: "简体中文" }));
    await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(setLocaleAction).toHaveBeenCalledWith("zh-CN");
  });
});
