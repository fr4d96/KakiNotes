import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NoPinchZoom } from "./no-pinch-zoom";

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

/** Dispatches a WebKit pinch event; true when something cancelled it. */
function pinch(type: "gesturestart" | "gesturechange") {
  const event = new Event(type, { cancelable: true, bubbles: true });
  document.body.dispatchEvent(event);
  return event.defaultPrevented;
}

afterEach(() => vi.unstubAllGlobals());

describe("NoPinchZoom", () => {
  it("cancels page pinch-zoom in the home-screen app", () => {
    installed(true);
    render(<NoPinchZoom />);
    expect(pinch("gesturestart")).toBe(true);
    expect(pinch("gesturechange")).toBe(true);
  });

  it("leaves pinch-zoom alone in a browser tab", () => {
    installed(false);
    render(<NoPinchZoom />);
    expect(pinch("gesturestart")).toBe(false);
  });

  it("stops cancelling once removed", () => {
    installed(true);
    const { unmount } = render(<NoPinchZoom />);
    unmount();
    expect(pinch("gesturestart")).toBe(false);
  });
});
