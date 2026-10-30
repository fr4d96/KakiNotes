import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { PullToRefresh } from "./pull-to-refresh";

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
  refresh.mockReset();
  installed(true);
  window.scrollY = 0;
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PullToRefresh", () => {
  it("refreshes the page after a hard pull from the top", () => {
    render(<PullToRefresh />);
    act(() => pull(200)); // 200px of finger = 100px of pull, past 72
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent("Refreshing…");
  });

  it("springs back without refreshing after a light pull", () => {
    render(<PullToRefresh />);
    act(() => pull(100)); // 50px of pull, short of 72
    expect(refresh).not.toHaveBeenCalled();
  });

  it("follows the finger while pulling", () => {
    const { container } = render(<PullToRefresh />);
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
    render(<PullToRefresh />);
    act(() => pull(300));
    expect(refresh).not.toHaveBeenCalled();
  });

  it("does nothing when the page is not at the top", () => {
    window.scrollY = 120;
    render(<PullToRefresh />);
    act(() => pull(300));
    expect(refresh).not.toHaveBeenCalled();
  });

  it("leaves maps, sheets and other gestures alone", () => {
    render(
      <>
        <PullToRefresh />
        <svg role="group" aria-label="map" data-testid="map" />
        <div data-no-pull data-testid="opt-out" />
      </>,
    );
    act(() => pull(300, screen.getByTestId("map")));
    act(() => pull(300, screen.getByTestId("opt-out")));
    expect(refresh).not.toHaveBeenCalled();
  });
});
