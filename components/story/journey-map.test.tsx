import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { JourneyMap } from "./journey-map";
import type { JourneyStopView } from "@/lib/journey/schema";

const AUCKLAND: JourneyStopView = {
  latitude: -36.85,
  longitude: 174.76,
  label: "Auckland",
  storyTitle: "Arriving in Auckland",
  href: "/stories/arriving-in-auckland",
  parentIndex: null,
};
const WELLINGTON: JourneyStopView = {
  latitude: -41.29,
  longitude: 174.78,
  label: "Wellington",
  storyTitle: "A windy week",
  href: "/stories/a-windy-week",
  parentIndex: null,
};
const QUEENSTOWN: JourneyStopView = {
  latitude: -45.03,
  longitude: 168.66,
  label: "Queenstown",
  storyTitle: "Gone missing in Queenstown",
  href: "/stories/gone-missing",
  parentIndex: null,
};
const STOPS = [AUCKLAND, WELLINGTON, QUEENSTOWN];

function currentItem() {
  const el = within(screen.getByRole("list", { name: "Stops" }))
    .getAllByRole("listitem")
    .find((li) => li.getAttribute("aria-current") === "step");
  if (!el) throw new Error("no current step");
  return el;
}

const states = () =>
  within(screen.getByRole("list", { name: "Stops" }))
    .getAllByRole("listitem")
    .map((li) => li.getAttribute("data-state"));

const fillOf = (i: number) =>
  (
    screen.getAllByTestId("journey-connector")[i]
      .firstElementChild as HTMLElement
  ).style.transform;

function mockReducedMotion(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
}

describe("JourneyMap", () => {
  beforeEach(() => {
    mockReducedMotion(false);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("renders nothing for no stops", () => {
    const { container } = render(<JourneyMap stops={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a single pin without a route, van or play button", () => {
    render(<JourneyMap stops={[AUCKLAND]} />);
    const items = within(
      screen.getByRole("list", { name: "Stops" }),
    ).getAllByRole("listitem");
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent("Auckland");
    expect(items[0]).toHaveTextContent("Arriving in Auckland");
    expect(
      screen.getByRole("link", { name: /Read this story/ }),
    ).toHaveAttribute("href", "/stories/arriving-in-auckland");
    expect(screen.getByRole("status")).toHaveTextContent(
      "One place on the map so far.",
    );
    expect(
      screen.queryByRole("button", { name: /Play|Pause|Replay/ }),
    ).toBeNull();
    expect(screen.queryByTestId("journey-connector")).toBeNull();
    expect(screen.queryByTestId("journey-campervan")).toBeNull();
    // The whole of New Zealand stays in view (no zoom onto the lone pin).
    const svg = screen.getByRole("group", {
      name: /route through new zealand/i,
    });
    expect(
      svg.getAttribute("viewBox")!.split(" ").map(Number).slice(2),
    ).toEqual([220, 300]);
  });

  it("always renders the ordered text list of stops, each linking to its story", () => {
    render(<JourneyMap stops={STOPS} />);
    const list = screen.getByRole("list");
    const items = within(list).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining("Auckland"),
      expect.stringContaining("Wellington"),
      expect.stringContaining("Queenstown"),
    ]);
    // The place label sits beside the story's title.
    expect(items[1]).toHaveTextContent("A windy week");
    const links = within(list).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/stories/arriving-in-auckland",
      "/stories/a-windy-week",
      "/stories/gone-missing",
    ]);
    expect(links[0]).toHaveTextContent("Read this story");
    // The link's accessible name says which story.
    expect(links[2]).toHaveAccessibleName(
      "Read this story: Gone missing in Queenstown",
    );
  });

  it("labels the picture and never prints coordinates", () => {
    const { container } = render(<JourneyMap stops={STOPS} />);
    expect(
      screen.getByRole("group", { name: /route through new zealand with 3/i }),
    ).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/-36\.85|174\.76/);
  });

  it("makes the pins keyboard focusable and selects the stop on Enter", () => {
    render(<JourneyMap stops={STOPS} />);
    const pin = screen.getByRole("button", { name: "Stop 3: Queenstown" });
    expect(pin).toHaveAttribute("tabindex", "0");
    fireEvent.keyDown(pin, { key: "Enter" });
    expect(screen.getByRole("status")).toHaveTextContent("Stop 3 of 3");
    const current = currentItem();
    expect(current).toHaveTextContent("Queenstown");
    expect(
      within(current).getByRole("link", { name: /^Read this story/ }),
    ).toHaveAttribute("href", "/stories/gone-missing");
    // Selecting a stop pauses the animation.
    expect(
      screen.getByRole("button", { name: "Play the journey" }),
    ).toBeInTheDocument();
  });

  it("shows the first stop's card to begin with", () => {
    render(<JourneyMap stops={STOPS} />);
    expect(screen.getByRole("status")).toHaveTextContent("Stop 1 of 3");
    expect(screen.getByTestId("journey-campervan")).toBeInTheDocument();
  });

  it("toggles play and pause", () => {
    render(<JourneyMap stops={STOPS} />);
    const button = screen.getByRole("button", { name: "Pause" });
    fireEvent.click(button);
    expect(
      screen.getByRole("button", { name: "Play the journey" }),
    ).toBeInTheDocument();
  });

  it("drives to the next stop, swapping to the ferry across Cook Strait", () => {
    vi.useFakeTimers();
    let now = 0;
    const callbacks: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      callbacks.push(cb);
      return callbacks.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.spyOn(performance, "now").mockImplementation(() => now);

    // Wellington -> Queenstown crosses Cook Strait; start there by picking
    // stops that begin on the north island.
    render(<JourneyMap stops={[WELLINGTON, QUEENSTOWN]} />);

    function advance(ms: number) {
      for (let elapsed = 0; elapsed < ms; elapsed += 50) {
        now += 50;
        const cb = callbacks.shift();
        if (cb) act(() => cb(now));
      }
    }

    advance(2700); // dwell at stop 1, then set off
    expect(screen.getByRole("status")).toHaveTextContent(
      "On the ferry across Cook Strait to Queenstown",
    );
    expect(screen.getByTestId("journey-ferry")).toBeInTheDocument();
    expect(screen.queryByTestId("journey-campervan")).not.toBeInTheDocument();

    advance(6000); // arrive
    expect(screen.getByRole("status")).toHaveTextContent("Stop 2 of 2");
    expect(screen.getByTestId("journey-campervan")).toBeInTheDocument();
  });

  it("keeps real time at low frame rates and skips time while the tab is hidden", () => {
    vi.useFakeTimers();
    let now = 0;
    const callbacks: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      callbacks.push(cb);
      return callbacks.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.spyOn(performance, "now").mockImplementation(() => now);
    let visibility: DocumentVisibilityState = "visible";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(
      () => visibility,
    );
    render(<JourneyMap stops={[WELLINGTON, QUEENSTOWN]} />);

    function frames(count: number, dt: number) {
      for (let i = 0; i < count; i += 1) {
        now += dt;
        const cb = callbacks.shift();
        if (cb) act(() => cb(now));
      }
    }

    // 2 fps: 6 frames = 3s of real time, past the 2.6s dwell. The old 100ms
    // clamp would have counted only 0.6s here and still been at stop 1.
    frames(6, 500);
    expect(screen.getByRole("status")).toHaveTextContent(
      "On the ferry across Cook Strait to Queenstown",
    );

    // Hidden for a minute: the van must not jump ahead.
    visibility = "hidden";
    frames(1, 60_000);
    visibility = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    frames(1, 16);
    expect(screen.getByRole("status")).toHaveTextContent(
      "On the ferry across Cook Strait to Queenstown",
    );

    // Still ~5s of drive at 2 fps and it arrives.
    frames(12, 500);
    expect(screen.getByRole("status")).toHaveTextContent("Stop 2 of 2");
  });

  it("uses the campervan wording on a leg that stays on one island", () => {
    vi.useFakeTimers();
    let now = 0;
    const callbacks: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      callbacks.push(cb);
      return callbacks.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.spyOn(performance, "now").mockImplementation(() => now);
    render(<JourneyMap stops={[AUCKLAND, WELLINGTON]} />);
    for (let i = 0; i < 60; i += 1) {
      now += 50;
      const cb = callbacks.shift();
      if (cb) act(() => cb(now));
    }
    expect(screen.getByRole("status")).toHaveTextContent(
      "On the road to Wellington",
    );
    expect(screen.getByTestId("journey-campervan")).toBeInTheDocument();
  });

  it("does not animate under prefers-reduced-motion", () => {
    mockReducedMotion(true);
    const raf = vi.fn();
    vi.stubGlobal("requestAnimationFrame", raf);
    render(<JourneyMap stops={STOPS} />);
    expect(raf).not.toHaveBeenCalled();
    expect(screen.queryByTestId("journey-campervan")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /play|pause/i })).toBeNull();
    // The route and list are still there, and pins still work.
    expect(screen.getByRole("list")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Stop 2: Wellington" }));
    expect(currentItem()).toHaveTextContent("Wellington");
  });

  it("shows the whole route with the first stop selected under reduced motion, and items still select", () => {
    mockReducedMotion(true);
    vi.stubGlobal("requestAnimationFrame", vi.fn());
    render(<JourneyMap stops={STOPS} />);
    expect(states()).toEqual(["current", "upcoming", "upcoming"]);
    expect(currentItem()).toHaveTextContent("Auckland");
    expect(screen.queryByTestId("journey-ferry")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Queenstown" }));
    expect(states()).toEqual(["visited", "visited", "current"]);
    // No progressive fill: legs are either fully filled or empty.
    expect(fillOf(0)).toBe("scaleY(1)");
    expect(fillOf(1)).toBe("scaleY(1)");
  });
});

describe("JourneyMap timeline", () => {
  beforeEach(() => {
    mockReducedMotion(false);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("is an ordered list with the first stop current", () => {
    const { container } = render(<JourneyMap stops={STOPS} />);
    expect(container.querySelector("ol")).not.toBeNull();
    expect(states()).toEqual(["current", "upcoming", "upcoming"]);
    expect(currentItem()).toHaveTextContent("Stop 1 of 3");
  });

  it("jumps to a stop and pauses when its timeline item is clicked", () => {
    render(<JourneyMap stops={STOPS} />);
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Wellington" }));
    expect(states()).toEqual(["visited", "current", "upcoming"]);
    expect(currentItem()).toHaveTextContent("Wellington");
    expect(screen.getByRole("status")).toHaveTextContent("Stop 2 of 3");
    expect(fillOf(0)).toBe("scaleY(1)");
    expect(fillOf(1)).toBe("scaleY(0)");
    expect(
      screen.getByRole("button", { name: "Play the journey" }),
    ).toBeInTheDocument();
    // Pins and timeline stay in sync both ways.
    fireEvent.click(screen.getByRole("button", { name: "Stop 3: Queenstown" }));
    expect(states()).toEqual(["visited", "visited", "current"]);
  });

  it("fills the connector progressively while driving, with the vehicle riding it", () => {
    vi.useFakeTimers();
    let now = 0;
    const callbacks: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      callbacks.push(cb);
      return callbacks.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.spyOn(performance, "now").mockImplementation(() => now);
    render(<JourneyMap stops={[AUCKLAND, WELLINGTON]} />);
    const step = (ms: number) => {
      for (let e = 0; e < ms; e += 50) {
        now += 50;
        const cb = callbacks.shift();
        if (cb) act(() => cb(now));
      }
    };
    step(2700); // dwell, then set off: destination becomes current
    expect(states()).toEqual(["visited", "current"]);
    const ride = screen.getAllByTestId("journey-connector")[0];
    expect(ride.querySelector("svg")).not.toBeNull();
    step(1500);
    const mid = Number(/scaleY\(([\d.]+)\)/.exec(fillOf(0))?.[1]);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    step(6000); // arrive
    expect(fillOf(0)).toBe("scaleY(1)");
    expect(ride.querySelector("svg")).toBeNull();
  });
});

describe("JourneyMap camera and dots", () => {
  beforeEach(() => {
    mockReducedMotion(false);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("numbers and labels only the current stop; the others are plain dots with accessible names", () => {
    render(<JourneyMap stops={STOPS} />);
    const pin = screen.getByTestId("journey-current-pin");
    expect(pin).toHaveTextContent("1");
    expect(pin).toHaveTextContent("Auckland");
    // Exactly one label chip, and the other stops are unnumbered dots.
    expect(screen.getAllByTestId("journey-label-chip")).toHaveLength(1);
    expect(screen.getAllByTestId("journey-dot")).toHaveLength(2);
    for (const [n, label] of [
      [2, "Wellington"],
      [3, "Queenstown"],
    ] as const) {
      const dot = screen.getByRole("button", { name: `Stop ${n}: ${label}` });
      expect(dot).toHaveAttribute("tabindex", "0");
      expect(dot).not.toHaveTextContent(/\d/);
    }
  });

  it("moves the number and label to the stop that is selected", () => {
    render(<JourneyMap stops={STOPS} />);
    fireEvent.click(screen.getByRole("button", { name: "Stop 3: Queenstown" }));
    const pin = screen.getByTestId("journey-current-pin");
    expect(pin).toHaveTextContent("3");
    expect(pin).toHaveTextContent("Queenstown");
    expect(screen.getAllByTestId("journey-label-chip")).toHaveLength(1);
  });

  it("shows a name chip for a hovered dot and highlights its timeline item", () => {
    render(<JourneyMap stops={STOPS} />);
    fireEvent.mouseEnter(
      screen.getByRole("button", { name: "Stop 2: Wellington" }),
    );
    expect(screen.getAllByTestId("journey-label-chip")).toHaveLength(2);
    fireEvent.mouseLeave(
      screen.getByRole("button", { name: "Stop 2: Wellington" }),
    );
    expect(screen.getAllByTestId("journey-label-chip")).toHaveLength(1);
  });

  it("keeps the whole of New Zealand in view under reduced motion", () => {
    mockReducedMotion(true);
    vi.stubGlobal("requestAnimationFrame", vi.fn());
    const { container } = render(<JourneyMap stops={STOPS} />);
    const svg = container.querySelector("svg[role='group']");
    expect(svg).toHaveAttribute("viewBox", "0 0 220 300");
    fireEvent.click(screen.getByRole("button", { name: "Stop 3: Queenstown" }));
    expect(svg).toHaveAttribute("viewBox", "0 0 220 300");
    expect(screen.getByTestId("journey-current-pin")).toHaveTextContent("3");
  });

  it("zooms in on a close pair of stops and eases back out at the end", () => {
    vi.useFakeTimers();
    let now = 0;
    const callbacks: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      callbacks.push(cb);
      return callbacks.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const arrowtown: JourneyStopView = {
      latitude: -44.94,
      longitude: 168.83,
      label: "Arrowtown",
      storyTitle: "Arrowtown autumn",
      href: "/stories/arrowtown-autumn",
      parentIndex: null,
    };
    const { container } = render(
      <JourneyMap stops={[QUEENSTOWN, arrowtown]} />,
    );
    const svg = container.querySelector("svg[role='group']")!;
    const width = () => Number(svg.getAttribute("viewBox")!.split(" ")[2]);
    expect(width()).toBe(220);
    for (let i = 0; i < 40; i += 1) {
      now += 50;
      const cb = callbacks.shift();
      if (cb) act(() => cb(now));
    }
    // Camera has eased in (never beyond 4x).
    expect(width()).toBeLessThan(120);
    expect(width()).toBeGreaterThanOrEqual(55 - 0.01);
    // Run the whole journey: afterwards the full view returns.
    for (let i = 0; i < 400; i += 1) {
      now += 50;
      const cb = callbacks.shift();
      if (cb) act(() => cb(now));
    }
    expect(
      screen.getByRole("button", { name: "Replay the journey" }),
    ).toBeTruthy();
    expect(width()).toBeCloseTo(220, 0);
  });
});

describe("JourneyMap reader zoom and pan", () => {
  beforeEach(() => {
    // Reduced motion applies view changes instantly, which keeps these sync.
    mockReducedMotion(true);
    vi.stubGlobal("requestAnimationFrame", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const setup = () => {
    const utils = render(<JourneyMap stops={STOPS} />);
    const svg = utils.container.querySelector("svg[role='group']")!;
    const box = () =>
      svg.getAttribute("viewBox")!.split(" ").map(Number) as number[];
    return { svg, box };
  };

  it("describes the controls for assistive tech", () => {
    const { svg } = setup();
    const id = svg.getAttribute("aria-describedby")!;
    expect(document.getElementById(id)?.textContent).toMatch(/arrow keys pan/);
  });

  it("zooms in and out with the buttons but never past the full view", () => {
    const { box } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(box()).toEqual([0, 0, 220, 300]);
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(box()[2]).toBeLessThan(220);
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(box()).toEqual([0, 0, 220, 300]);
  });

  it("stops zooming in at about 8x", () => {
    const { box } = setup();
    for (let i = 0; i < 12; i += 1) {
      fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    }
    expect(box()[2]).toBeCloseTo(27.5, 1);
  });

  it("returns to the automatic view with the re-centre button", () => {
    const { box } = setup();
    const reset = screen.getByRole("button", { name: "Reset map view" });
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(box()[2]).toBeLessThan(220);
    fireEvent.click(reset);
    expect(box()).toEqual([0, 0, 220, 300]);
  });

  it("does not zoom on a plain wheel, and shows the hint", () => {
    const { svg, box } = setup();
    fireEvent.wheel(svg, { deltaY: -120 });
    expect(box()).toEqual([0, 0, 220, 300]);
    expect(screen.getByTestId("journey-hint")).toHaveTextContent(
      "Use Ctrl + scroll to zoom the map",
    );
  });

  it("zooms on Ctrl + wheel and on trackpad pinch (wheel + ctrlKey)", () => {
    const { svg, box } = setup();
    fireEvent.wheel(svg, { deltaY: -50, ctrlKey: true });
    const w = box()[2];
    expect(w).toBeLessThan(220);
    fireEvent.wheel(svg, { deltaY: -50, metaKey: true });
    expect(box()[2]).toBeLessThan(w);
    expect(screen.queryByTestId("journey-hint")).toBeNull();
  });

  it("zooms and pans with the keyboard", () => {
    const { svg, box } = setup();
    fireEvent.keyDown(svg, { key: "+" });
    const zoomed = box();
    expect(zoomed[2]).toBeLessThan(220);
    fireEvent.keyDown(svg, { key: "ArrowRight" });
    expect(box()[0]).toBeGreaterThan(zoomed[0]);
    fireEvent.keyDown(svg, { key: "ArrowDown" });
    expect(box()[1]).toBeGreaterThan(zoomed[1]);
    fireEvent.keyDown(svg, { key: "-" });
    fireEvent.keyDown(svg, { key: "-" });
    expect(box()).toEqual([0, 0, 220, 300]);
  });

  it("pans by dragging, clamped inside the picture", () => {
    const { svg, box } = setup();
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 220,
      height: 300,
      right: 220,
      bottom: 300,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    const start = box();
    fireEvent.pointerDown(svg, {
      pointerId: 1,
      pointerType: "mouse",
      button: 0,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(svg, {
      pointerId: 1,
      pointerType: "mouse",
      clientX: 70,
      clientY: 100,
    });
    expect(box()[0]).toBeGreaterThan(start[0]);
    fireEvent.pointerMove(svg, {
      pointerId: 1,
      pointerType: "mouse",
      clientX: -5000,
      clientY: 100,
    });
    fireEvent.pointerUp(svg, { pointerId: 1, pointerType: "mouse" });
    expect(box()[0] + box()[2]).toBeLessThanOrEqual(220 + 1e-6);
  });

  it("shows the two-finger hint on a one-finger touch drag but does not move the map", () => {
    const { svg, box } = setup();
    fireEvent.pointerDown(svg, {
      pointerId: 5,
      pointerType: "touch",
      clientX: 50,
      clientY: 50,
    });
    fireEvent.pointerMove(svg, {
      pointerId: 5,
      pointerType: "touch",
      clientX: 50,
      clientY: 90,
    });
    expect(screen.getByTestId("journey-hint")).toHaveTextContent(
      "Use two fingers to move the map",
    );
    expect(box()).toEqual([0, 0, 220, 300]);
  });

  it("leaves manual mode when a timeline item is clicked", () => {
    const { box } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(box()[2]).toBeLessThan(220);
    const timeline = within(screen.getByRole("list", { name: "Stops" }));
    fireEvent.click(timeline.getByRole("button", { name: "Wellington" }));
    expect(box()).toEqual([0, 0, 220, 300]);
  });
});

describe("JourneyMap manual mode with the camera following", () => {
  beforeEach(() => mockReducedMotion(false));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("stops following after a manual zoom and resumes on re-centre", () => {
    vi.useFakeTimers();
    let now = 0;
    const callbacks: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      callbacks.push(cb);
      return callbacks.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const arrowtown: JourneyStopView = {
      latitude: -44.94,
      longitude: 168.83,
      label: "Arrowtown",
      storyTitle: "Arrowtown autumn",
      href: "/stories/arrowtown-autumn",
      parentIndex: null,
    };
    const { container } = render(
      <JourneyMap stops={[QUEENSTOWN, arrowtown]} />,
    );
    const svg = container.querySelector("svg[role='group']")!;
    const width = () => Number(svg.getAttribute("viewBox")!.split(" ")[2]);
    const run = (n: number) => {
      for (let i = 0; i < n; i += 1) {
        now += 50;
        const cb = callbacks.shift();
        if (cb) act(() => cb(now));
      }
    };
    run(40);
    const followed = width();
    expect(followed).toBeLessThan(120);
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    run(60);
    const manualW = width();
    expect(manualW).toBeGreaterThan(followed);
    // The van keeps driving to the end, but the camera does not follow.
    run(300);
    expect(width()).toBeCloseTo(manualW, 0);
    fireEvent.click(
      screen.getByRole("button", { name: "Re-centre and follow the van" }),
    );
    run(80);
    expect(width()).toBeCloseTo(220, 0);
  });
});

describe("JourneyMap main stops and sub-stops", () => {
  const sub = (
    label: string,
    parentIndex: number,
    latitude: number,
    longitude: number,
  ): JourneyStopView => ({
    latitude,
    longitude,
    label,
    storyTitle: `${label} story`,
    href: `/stories/${label.toLowerCase()}`,
    parentIndex,
  });
  // 0 Auckland, 1 Wellington, 2 Queenstown (+ Arrowtown, Glenorchy)
  const HIERARCHY: JourneyStopView[] = [
    AUCKLAND,
    WELLINGTON,
    QUEENSTOWN,
    sub("Arrowtown", 2, -44.94, 168.83),
    sub("Glenorchy", 2, -44.85, 168.39),
  ];

  beforeEach(() => {
    mockReducedMotion(false);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("shows only main stops at first, with a count on the main stop", () => {
    render(<JourneyMap stops={HIERARCHY} />);
    expect(states()).toEqual(["current", "upcoming", "upcoming"]);
    expect(screen.queryByText("Arrowtown")).toBeNull();
    expect(screen.queryByTestId("journey-substops")).toBeNull();
    expect(screen.getByTestId("journey-more-places")).toHaveTextContent(
      "+2 places",
    );
    expect(screen.getByRole("button", { name: /^Queenstown/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    // A main stop without sub-stops keeps behaving as before.
    expect(
      screen.getByRole("button", { name: "Wellington" }),
    ).not.toHaveAttribute("aria-expanded");
  });

  it("a lone main stop with a place inside still opens, without any route", () => {
    render(
      <JourneyMap stops={[AUCKLAND, sub("Hamilton", 0, -37.78, 175.28)]} />,
    );
    expect(screen.queryByRole("button", { name: /Play|Pause/ })).toBeNull();
    const opener = screen.getByRole("button", { name: /^Auckland/ });
    expect(opener).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(opener);
    expect(opener).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("list", { name: "Places inside Auckland" }),
    ).toHaveTextContent("Hamilton");
  });

  it("opens a main stop: parks the drive, shows lettered sub-stops and a nested list", () => {
    render(<JourneyMap stops={HIERARCHY} />);
    fireEvent.click(screen.getByRole("button", { name: /^Queenstown/ }));
    expect(screen.getByRole("button", { name: /^Queenstown/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getAllByTestId("journey-sub-pin")).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Place 3a: Arrowtown" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Place 3b: Glenorchy" }),
    ).toBeInTheDocument();
    const nested = screen.getByRole("list", {
      name: "Places inside Queenstown",
    });
    expect(within(nested).getAllByRole("listitem")).toHaveLength(2);
    // Sub-stops link to their own stories, with the story title shown.
    const links = within(nested).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/stories/arrowtown",
      "/stories/glenorchy",
    ]);
    expect(nested).toHaveTextContent("Glenorchy story");
    // Drive paused, van parked at Queenstown; focus on the way back.
    expect(
      screen.getByRole("button", { name: "Play the journey" }),
    ).toBeInTheDocument();
    expect(currentItem()).toHaveTextContent("Queenstown");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Exploring Queenstown: 2 places",
    );
    expect(
      screen.getByRole("button", { name: "Back to whole journey" }),
    ).toHaveFocus();
  });

  it("closes with Back, restoring only main stops and resuming the drive", () => {
    render(<JourneyMap stops={HIERARCHY} />);
    const opener = screen.getByRole("button", { name: /^Queenstown/ });
    fireEvent.click(opener);
    fireEvent.click(
      screen.getByRole("button", { name: "Back to whole journey" }),
    );
    expect(screen.queryByTestId("journey-substops")).toBeNull();
    expect(screen.getByRole("button", { name: /^Queenstown/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    // The drive was running when it was opened, so it resumes.
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Queenstown/ })).toHaveFocus();
  });

  it("closes with Escape and does not resume a drive that was paused", () => {
    render(<JourneyMap stops={HIERARCHY} />);
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    fireEvent.click(screen.getByRole("button", { name: /^Queenstown/ }));
    fireEvent.keyDown(
      screen.getByRole("button", { name: "Back to whole journey" }),
      { key: "Escape" },
    );
    expect(screen.queryByTestId("journey-substops")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Play the journey" }),
    ).toBeInTheDocument();
  });

  it("opens from a pin with the keyboard and keeps one group open at a time", () => {
    const withSecond: JourneyStopView[] = [
      AUCKLAND,
      sub("Hamilton", 0, -37.78, 175.28),
      WELLINGTON,
      QUEENSTOWN,
      sub("Arrowtown", 3, -44.94, 168.83),
    ];
    render(<JourneyMap stops={withSecond} />);
    const pin = screen.getByRole("button", {
      name: "Stop 1: Auckland, 1 place inside",
    });
    fireEvent.keyDown(pin, { key: "Enter" });
    expect(
      screen.getByRole("button", { name: "Place 1a: Hamilton" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Queenstown/ }));
    expect(screen.queryByRole("button", { name: /Hamilton/ })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Place 3a: Arrowtown" }),
    ).toBeInTheDocument();
    expect(screen.getAllByTestId("journey-sub-pin")).toHaveLength(1);
  });

  it("opens instantly with reduced motion (no van, camera set at once)", () => {
    mockReducedMotion(true);
    const { container } = render(<JourneyMap stops={HIERARCHY} />);
    const svg = container.querySelector("svg[role='group']")!;
    fireEvent.click(screen.getByRole("button", { name: /^Queenstown/ }));
    expect(screen.getAllByTestId("journey-sub-pin")).toHaveLength(2);
    expect(Number(svg.getAttribute("viewBox")!.split(" ")[2])).toBeLessThan(
      200,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Back to whole journey" }),
    );
    expect(Number(svg.getAttribute("viewBox")!.split(" ")[2])).toBeCloseTo(
      220,
      0,
    );
  });
});
