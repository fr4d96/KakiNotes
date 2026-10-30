import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppSplash } from "./app-splash";

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(performance, "now").mockReturnValue(0);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("AppSplash", () => {
  it("is decorative and draws the app icon at the launch image's size", () => {
    const { container } = render(<AppSplash />);
    const splash = container.querySelector("#app-splash")!;
    expect(splash).toHaveAttribute("aria-hidden", "true");
    const icon = splash.querySelector("img")!;
    expect(icon).toHaveAttribute("src", "/icons/icon-192.png");
    expect(icon).toHaveAttribute("width", "120");
  });

  it("stays up briefly, then fades and is hidden for good", () => {
    const { container } = render(<AppSplash />);
    const splash = container.querySelector<HTMLElement>("#app-splash")!;
    expect(splash.dataset.state).toBeUndefined();

    act(() => vi.advanceTimersByTime(399));
    expect(splash.dataset.state).toBeUndefined();

    act(() => vi.advanceTimersByTime(1));
    expect(splash.dataset.state).toBe("hiding");

    act(() => vi.advanceTimersByTime(280));
    expect(splash.dataset.state).toBe("done");
  });

  it("hides straight away when the page took longer than the minimum to load", () => {
    vi.spyOn(performance, "now").mockReturnValue(2000);
    const { container } = render(<AppSplash />);
    act(() => vi.advanceTimersByTime(0));
    expect(
      container.querySelector<HTMLElement>("#app-splash")!.dataset.state,
    ).toBe("hiding");
  });
});
