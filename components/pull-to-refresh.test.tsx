import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PullToRefresh } from "./pull-to-refresh";

const reload = vi.fn();

function installed(yes: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: yes && query === "(display-mode: standalone)",
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
}

/** A one-finger drag from y=100 down by `dy` pixels, starting on `target`. */
function pull(dy: number, target: Element = document.body) {
  fireEvent.touchStart(target, { touches: [{ clientX: 50, clientY: 100 }] });
  fireEvent.touchMove(target, {
    touches: [{ clientX: 50, clientY: 100 + dy }],
  });
  fireEvent.touchEnd(target, { touches: [] });
}

beforeEach(() => {
  vi.useFakeTimers();
  reload.mockReset();
  installed(true);
  window.scrollY = 0;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("PullToRefresh", () => {
  it("reloads the page after a hard pull from the top, spinning meanwhile", () => {
    render(<PullToRefresh reload={reload} />);
    act(() => pull(200)); // 200px of finger = 100px of pull, past 72
    expect(screen.getByRole("status")).toHaveTextContent("Refreshing…");
    // The spinner gets a moment to paint before the page goes.
    expect(reload).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(150));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("stops spinning if the reload never happens", () => {
    const { container } = render(<PullToRefresh reload={() => {}} />);
    act(() => pull(200));
    act(() => vi.advanceTimersByTime(10_000));
    expect(
      container.querySelector<HTMLElement>(".ptr-indicator")!.dataset.state,
    ).toBe("idle");
  });

  it("springs back without refreshing after a light pull", () => {
    render(<PullToRefresh reload={reload} />);
    act(() => pull(100)); // 50px of pull, short of 72
    act(() => vi.advanceTimersByTime(1000));
    expect(reload).not.toHaveBeenCalled();
  });

  it("follows the finger while pulling", () => {
    const { container } = render(<PullToRefresh reload={reload} />);
    fireEvent.touchStart(document.body, {
      touches: [{ clientX: 50, clientY: 100 }],
    });
    fireEvent.touchMove(document.body, {
      touches: [{ clientX: 50, clientY: 180 }],
    });
    const indicator = container.querySelector<HTMLElement>(".ptr-indicator")!;
    expect(indicator.dataset.state).toBe("pulling");
    expect(indicator.style.transform).toBe("translate(-50%, -8px)");
  });

  it("stays off in a browser tab, which has its own pull to refresh", () => {
    installed(false);
    render(<PullToRefresh reload={reload} />);
    act(() => pull(300));
    act(() => vi.advanceTimersByTime(1000));
    expect(reload).not.toHaveBeenCalled();
  });

  it("does nothing when the page is not at the top", () => {
    window.scrollY = 120;
    render(<PullToRefresh reload={reload} />);
    act(() => pull(300));
    act(() => vi.advanceTimersByTime(1000));
    expect(reload).not.toHaveBeenCalled();
  });

  it("leaves maps, sheets and other gestures alone", () => {
    render(
      <>
        <PullToRefresh reload={reload} />
        <svg role="group" aria-label="map" data-testid="map" />
        <div data-no-pull data-testid="opt-out" />
      </>,
    );
    act(() => pull(300, screen.getByTestId("map")));
    act(() => pull(300, screen.getByTestId("opt-out")));
    act(() => vi.advanceTimersByTime(1000));
    expect(reload).not.toHaveBeenCalled();
  });
});
