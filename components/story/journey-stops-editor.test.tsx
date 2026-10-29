import { describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { clientToSvgPoint, FULL_BOX } from "@/lib/journey/camera";
import { pointToLatLng, roundCoordinate } from "@/lib/journey/geo";
vi.mock("@/app/(contributor)/stories/[id]/edit/actions", () => ({
  resolveGoogleMapsLinkAction: vi.fn(),
}));

import {
  JourneyStopsEditor,
  initialStopKey,
  newStopKey,
  type JourneyDraftStop,
} from "./journey-stops-editor";

describe("stop keys", () => {
  it("gives loaded stops index-based keys, so server render and hydration agree", () => {
    newStopKey(); // advancing the browser-only counter must not affect them
    expect(initialStopKey(0)).toBe("stop-initial-0");
    expect(initialStopKey(3)).toBe("stop-initial-3");
  });

  it("never reuses a loaded stop's key for an added stop", () => {
    const added = Array.from({ length: 5 }, () => newStopKey());
    const loaded = Array.from({ length: 5 }, (_, i) => initialStopKey(i));
    expect(new Set([...added, ...loaded]).size).toBe(10);
  });
});
import {
  MAX_JOURNEY_LABEL_LENGTH,
  MAX_JOURNEY_MAIN_STOPS,
  MAX_JOURNEY_STOPS,
  MAX_SUB_STOPS_PER_MAIN,
  isInsideNz,
} from "@/lib/journey/geo";

const HEADINGS = [
  { anchor: "arriving", text: "Arriving", depth: 2 },
  { anchor: "the-van", text: "The van", depth: 3 },
];

function stop(
  n: number,
  patch: Partial<JourneyDraftStop> = {},
): JourneyDraftStop {
  return {
    key: `k${n}`,
    latitude: -40 - n,
    longitude: 172 + n,
    label: `Place ${n}`,
    sectionAnchor: null,
    ...patch,
  };
}

function mockRect(el: Element) {
  el.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      width: 220,
      height: 300,
      right: 220,
      bottom: 300,
      x: 0,
      y: 0,
    }) as DOMRect;
}

describe("JourneyStopsEditor", () => {
  it("adds a stop, inside New Zealand, where the map is tapped", () => {
    const onChange = vi.fn();
    render(<JourneyStopsEditor stops={[]} headings={[]} onChange={onChange} />);
    const map = screen.getByTestId("journey-editor-map");
    mockRect(map);
    fireEvent.click(map, { clientX: 110, clientY: 150 });
    expect(onChange).toHaveBeenCalledTimes(1);
    const [next] = onChange.mock.calls[0];
    expect(next).toHaveLength(1);
    expect(isInsideNz(next[0])).toBe(true);
    expect(next[0].label).toBe("");
    expect(next[0].sectionAnchor).toBeNull();
  });

  describe("zoomable map", () => {
    function setup(stops: JourneyDraftStop[] = []) {
      const onChange = vi.fn();
      render(
        <JourneyStopsEditor stops={stops} headings={[]} onChange={onChange} />,
      );
      const map = screen.getByTestId("journey-editor-map");
      mockRect(map);
      const box = () =>
        (map.getAttribute("viewBox") ?? "").split(" ").map(Number);
      return { onChange, map, box };
    }

    it("puts the map on its own full-width row above the stops", () => {
      const { map } = setup([stop(1)]);
      expect(map.getAttribute("class")).toContain("w-full");
      expect(map.getAttribute("class")).toContain("md:h-[min(80vh,760px)]");
      const list = screen.getByRole("list");
      expect(
        map.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(list.contains(map)).toBe(false);
    });

    it("zooms with + and -, and re-centres", () => {
      const { box } = setup();
      expect(box()).toEqual([0, 0, 220, 300]);
      fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
      expect(box()[2]).toBeLessThan(220);
      const zoomed = box()[2];
      fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
      expect(box()[2]).toBeLessThan(zoomed);
      fireEvent.click(screen.getByRole("button", { name: "Reset map view" }));
      expect(box()).toEqual([0, 0, 220, 300]);
      fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
      expect(box()).toEqual([0, 0, 220, 300]);
    });

    it("zooms further than the reader map (12x)", () => {
      const { box } = setup();
      for (let i = 0; i < 20; i++) {
        fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
      }
      expect(220 / box()[2]).toBeCloseTo(12, 2);
    });

    it("pins a stop at the tapped place after zooming (zoom/pan aware)", () => {
      const { onChange, map, box } = setup();
      fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
      fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
      const b = box();
      const expected = pointToLatLng(
        clientToSvgPoint(
          { left: 0, top: 0, width: 220, height: 300 },
          { x: b[0], y: b[1], w: b[2], h: b[3] },
          55,
          75,
        ),
      );
      fireEvent.click(map, { clientX: 55, clientY: 75 });
      const [next] = onChange.mock.calls[0];
      expect(next[0].latitude).toBe(expected.latitude);
      expect(next[0].longitude).toBe(expected.longitude);
      // And it differs from where the same tap lands at full view.
      const fullView = pointToLatLng(
        clientToSvgPoint(
          { left: 0, top: 0, width: 220, height: 300 },
          FULL_BOX,
          55,
          75,
        ),
      );
      expect(next[0].latitude).not.toBe(fullView.latitude);
    });

    it("ignores taps in the sea margin of a letterboxed (wide) map", () => {
      const { onChange, map } = setup();
      map.getBoundingClientRect = () =>
        ({
          left: 0,
          top: 0,
          width: 900,
          height: 300,
          right: 900,
          bottom: 300,
          x: 0,
          y: 0,
        }) as DOMRect;
      fireEvent.click(map, { clientX: 50, clientY: 150 });
      expect(onChange).not.toHaveBeenCalled();
      fireEvent.click(map, { clientX: 450, clientY: 150 });
      expect(onChange).toHaveBeenCalledTimes(1);
      const p = onChange.mock.calls[0][0][0];
      expect(p.latitude).toBe(roundCoordinate(p.latitude));
    });

    it("pans (and does not place a stop) when dragged", () => {
      const { onChange, map, box } = setup();
      fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
      const start = box();
      fireEvent.pointerDown(map, {
        pointerId: 1,
        pointerType: "mouse",
        button: 0,
        clientX: 100,
        clientY: 100,
      });
      fireEvent.pointerMove(map, {
        pointerId: 1,
        pointerType: "mouse",
        clientX: 140,
        clientY: 100,
      });
      fireEvent.pointerUp(map, {
        pointerId: 1,
        pointerType: "mouse",
        clientX: 140,
        clientY: 100,
      });
      fireEvent.click(map, { clientX: 140, clientY: 100 });
      expect(box()[0]).toBeLessThan(start[0]);
      expect(onChange).not.toHaveBeenCalled();
    });

    it("still places a stop on a press that barely moves", () => {
      const { onChange, map } = setup();
      fireEvent.pointerDown(map, {
        pointerId: 1,
        pointerType: "mouse",
        button: 0,
        clientX: 100,
        clientY: 100,
      });
      fireEvent.pointerMove(map, {
        pointerId: 1,
        pointerType: "mouse",
        clientX: 102,
        clientY: 101,
      });
      fireEvent.pointerUp(map, { pointerId: 1, pointerType: "mouse" });
      fireEvent.click(map, { clientX: 102, clientY: 101 });
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it("adds the keyboard stop at the middle of the current view", () => {
      const { onChange, box } = setup();
      fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
      const b = box();
      const centre = pointToLatLng({ x: b[0] + b[2] / 2, y: b[1] + b[3] / 2 });
      fireEvent.click(
        screen.getByRole("button", {
          name: "Add a stop in the middle of the map",
        }),
      );
      const added = onChange.mock.calls[0][0][0];
      expect(added.latitude).toBe(centre.latitude);
      expect(added.longitude).toBe(centre.longitude);
    });

    it("keeps pins a constant on-screen size while zoomed", () => {
      const { box } = setup([stop(1)]);
      fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
      const pin = document.querySelector("[data-pin]")!;
      expect(pin.getAttribute("transform")).toContain(
        `scale(${Math.round((box()[2] / 220) * 1000) / 1000})`,
      );
    });
  });

  it("edits the label and picks a section from the story's headings", () => {
    const onChange = vi.fn();
    render(
      <JourneyStopsEditor
        stops={[stop(1)]}
        headings={HEADINGS}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText("Place name"), {
      target: { value: "Near Cromwell" },
    });
    expect(onChange.mock.calls[0][0][0].label).toBe("Near Cromwell");

    fireEvent.change(screen.getByLabelText("Links to part of your story"), {
      target: { value: "the-van" },
    });
    expect(onChange.mock.calls[1][0][0].sectionAnchor).toBe("the-van");
    expect(
      screen.getByRole("option", { name: "– The van" }),
    ).toBeInTheDocument();
  });

  it("reorders with up/down and removes", () => {
    const onChange = vi.fn();
    render(
      <JourneyStopsEditor
        stops={[stop(1), stop(2), stop(3)]}
        headings={[]}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Move stop 2 up" }));
    expect(
      onChange.mock.calls[0][0].map((s: JourneyDraftStop) => s.key),
    ).toEqual(["k2", "k1", "k3"]);
    fireEvent.click(screen.getByRole("button", { name: "Move stop 2 down" }));
    expect(
      onChange.mock.calls[1][0].map((s: JourneyDraftStop) => s.key),
    ).toEqual(["k1", "k3", "k2"]);
    fireEvent.click(screen.getByRole("button", { name: "Remove stop 1" }));
    expect(
      onChange.mock.calls[2][0].map((s: JourneyDraftStop) => s.key),
    ).toEqual(["k2", "k3"]);
  });

  it("disables the edges' impossible moves", () => {
    render(
      <JourneyStopsEditor
        stops={[stop(1), stop(2)]}
        headings={[]}
        onChange={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Move stop 1 up" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Move stop 2 down" }),
    ).toBeDisabled();
  });

  it("stops accepting taps at the limit", () => {
    const onChange = vi.fn();
    const full = Array.from({ length: MAX_JOURNEY_MAIN_STOPS }, (_, i) =>
      stop(i),
    );
    render(
      <JourneyStopsEditor stops={full} headings={[]} onChange={onChange} />,
    );
    const map = screen.getByTestId("journey-editor-map");
    mockRect(map);
    fireEvent.click(map, { clientX: 50, clientY: 50 });
    expect(onChange).not.toHaveBeenCalled();
    expect(
      screen.getByText(/You can have up to 12 main stops/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Add a stop in the middle of the map",
      }),
    ).toBeDisabled();
  });

  it("nudges a focused pin with the arrow keys, staying inside New Zealand", () => {
    const onChange = vi.fn();
    render(
      <JourneyStopsEditor
        stops={[stop(1, { latitude: -34.0, longitude: 178.9 })]}
        headings={[]}
        onChange={onChange}
      />,
    );
    const pin = screen.getByRole("button", { name: "Stop 1: Place 1" });
    fireEvent.keyDown(pin, { key: "ArrowUp" });
    fireEvent.keyDown(pin, { key: "ArrowRight" });
    expect(isInsideNz(onChange.mock.calls[0][0][0])).toBe(true);
    expect(onChange.mock.calls[0][0][0].latitude).toBe(-34);
    expect(onChange.mock.calls[1][0][0].longitude).toBe(178.9);
  });

  it("explains why a nameless stop isn't saved", () => {
    render(
      <JourneyStopsEditor
        stops={[stop(1, { label: "" })]}
        headings={[]}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(/place name/i);
  });

  describe("add from a Google Maps link", () => {
    const FULL =
      "https://www.google.com/maps/place/W%C4%81naka/@-44.7,169.13,12z/data=!8m2!3d-44.7032!4d169.1321";

    function setup(stops: JourneyDraftStop[] = [], resolveLink = vi.fn()) {
      const onChange = vi.fn();
      render(
        <JourneyStopsEditor
          stops={stops}
          headings={[]}
          onChange={onChange}
          resolveLink={resolveLink}
        />,
      );
      const input = screen.getByLabelText(/google maps link/i);
      return { onChange, resolveLink, input };
    }

    it("adds a stop from a full link locally, with the place name", async () => {
      const { onChange, resolveLink, input } = setup([stop(1)]);
      fireEvent.change(input, { target: { value: FULL } });
      fireEvent.click(screen.getByRole("button", { name: "Add stop" }));
      await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
      const next = onChange.mock.calls[0][0];
      expect(next).toHaveLength(2);
      expect(next[1]).toMatchObject({
        latitude: -44.7032,
        longitude: 169.1321,
        label: "Wānaka",
        sectionAnchor: null,
      });
      expect(resolveLink).not.toHaveBeenCalled();
    });

    it("submits on Enter without submitting the surrounding form", async () => {
      const onChange = vi.fn();
      const onSubmit = vi.fn((e: { preventDefault(): void }) =>
        e.preventDefault(),
      );
      render(
        <form onSubmit={onSubmit}>
          <JourneyStopsEditor
            stops={[]}
            headings={[]}
            onChange={onChange}
            resolveLink={vi.fn()}
          />
        </form>,
      );
      const input = screen.getByLabelText(/google maps link/i);
      fireEvent.change(input, { target: { value: FULL } });
      const notPrevented = fireEvent.keyDown(input, { key: "Enter" });
      expect(notPrevented).toBe(false);
      await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("caps a long place name to the label limit", async () => {
      const long = "A".repeat(80);
      const { onChange, input } = setup();
      fireEvent.change(input, {
        target: {
          value: `https://www.google.com/maps/place/${long}/@-44.7,169.13,12z`,
        },
      });
      fireEvent.click(screen.getByRole("button", { name: "Add stop" }));
      await waitFor(() => expect(onChange).toHaveBeenCalled());
      expect(onChange.mock.calls[0][0][0].label).toHaveLength(
        MAX_JOURNEY_LABEL_LENGTH,
      );
    });

    it("resolves a short link via the server and reports outside-NZ places", async () => {
      const resolveLink = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          latitude: -38.68,
          longitude: 176.07,
          placeName: null,
        })
        .mockResolvedValueOnce({ ok: false, reason: "outside_nz" });
      const { onChange, input } = setup([], resolveLink);
      fireEvent.change(input, {
        target: { value: "https://maps.app.goo.gl/abc" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Add stop" }));
      await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
      expect(onChange.mock.calls[0][0][0]).toMatchObject({
        latitude: -38.68,
        label: "",
      });
      expect(input).toHaveValue("");
      fireEvent.change(input, {
        target: { value: "https://maps.app.goo.gl/def" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Add stop" }));
      await screen.findByText(/outside New Zealand/i);
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it("rejects a local link outside NZ, and garbage, with a message", async () => {
      const { onChange, input } = setup();
      fireEvent.change(input, {
        target: { value: "https://www.google.com/maps/@51.5,-0.12,9z" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Add stop" }));
      await screen.findByText(/outside New Zealand/i);
      expect(onChange).not.toHaveBeenCalled();
    });

    it("shows an error when the server call fails and re-enables the button", async () => {
      const resolveLink = vi.fn().mockRejectedValue(new Error("boom"));
      const { input } = setup([], resolveLink);
      fireEvent.change(input, {
        target: { value: "https://maps.app.goo.gl/abc" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Add stop" }));
      await screen.findByText(/Couldn't open that link/i);
      expect(screen.getByRole("button", { name: "Add stop" })).toBeEnabled();
    });

    it("is disabled at the 12-main-stop cap", () => {
      const full = Array.from({ length: MAX_JOURNEY_MAIN_STOPS }, (_, i) =>
        stop(i),
      );
      const { input } = setup(full);
      expect(input).toBeDisabled();
      expect(screen.getByRole("button", { name: "Add stop" })).toBeDisabled();
    });
  });
});

describe("removing stops from the map", () => {
  function Harness({ initial }: { initial: JourneyDraftStop[] }) {
    const [stops, setStops] = useState(initial);
    return (
      <>
        <JourneyStopsEditor stops={stops} headings={[]} onChange={setStops} />
        <output data-testid="keys">{stops.map((s) => s.key).join(",")}</output>
      </>
    );
  }
  const keys = () => screen.getByTestId("keys").textContent;
  function setup(n = 3) {
    render(
      <Harness initial={Array.from({ length: n }, (_, i) => stop(i + 1))} />,
    );
    const map = screen.getByTestId("journey-editor-map");
    mockRect(map);
    return map;
  }
  const pin = (n: number) =>
    screen.getByRole("button", { name: new RegExp(`^Stop ${n}: Place ${n}`) });

  it("opens a popover on pin tap, marks it selected, and adds no stop", () => {
    setup();
    fireEvent.click(pin(2));
    expect(keys()).toBe("k1,k2,k3");
    expect(
      screen.getByRole("button", { name: "Stop 2: Place 2, selected" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Stop 2 actions" }),
    ).toHaveTextContent("Stop 2: Place 2");
  });

  it("removes the right stop from the popover and offers Undo", () => {
    setup();
    fireEvent.click(pin(2));
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(keys()).toBe("k1,k3");
    expect(screen.queryByRole("group", { name: "Stop 2 actions" })).toBeNull();
    expect(screen.getByText("Removed “Place 2”")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(keys()).toBe("k1,k2,k3");
    expect(screen.queryByText("Removed “Place 2”")).toBeNull();
  });

  it("removes via the card button through the same undo path", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Remove stop 1" }));
    expect(keys()).toBe("k2,k3");
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(keys()).toBe("k1,k2,k3");
  });

  it("removes a focused pin with Delete and focuses the next pin", async () => {
    setup();
    fireEvent.keyDown(pin(1), { key: "Delete" });
    expect(keys()).toBe("k2,k3");
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Stop 1: Place 2" }),
      ),
    );
  });

  it("focuses the map after deleting the last pin", async () => {
    setup(1);
    fireEvent.keyDown(pin(1), { key: "Backspace" });
    expect(keys()).toBe("");
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByTestId("journey-editor-map"),
      ),
    );
  });

  it("opens the popover with Enter and closes it with Escape", () => {
    setup();
    fireEvent.keyDown(pin(3), { key: "Enter" });
    expect(screen.getByRole("group", { name: "Stop 3 actions" })).toBeVisible();
    fireEvent.keyDown(screen.getByRole("button", { name: "Edit" }), {
      key: "Escape",
    });
    expect(screen.queryByRole("group", { name: "Stop 3 actions" })).toBeNull();
    expect(keys()).toBe("k1,k2,k3");
  });

  it("Edit focuses that stop's name field", () => {
    setup();
    fireEvent.click(pin(2));
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(document.activeElement).toBe(
      screen.getAllByLabelText("Place name")[1],
    );
  });

  it("the first tap on empty map with a popover open only closes it", () => {
    const map = setup();
    fireEvent.click(pin(1));
    fireEvent.click(map, { clientX: 110, clientY: 150 });
    expect(screen.queryByRole("group", { name: "Stop 1 actions" })).toBeNull();
    expect(keys()).toBe("k1,k2,k3");
    fireEvent.click(map, { clientX: 110, clientY: 150 });
    expect(keys().split(",")).toHaveLength(4);
  });

  it("offers Undo after a tap adds a stop, and Undo removes it", () => {
    const map = setup(2);
    fireEvent.click(map, { clientX: 110, clientY: 150 });
    expect(keys().split(",")).toHaveLength(3);
    expect(screen.getByText("Added stop 3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(keys()).toBe("k1,k2");
  });

  it("undoes with Ctrl+Z, but not from a text field", () => {
    const map = setup(2);
    fireEvent.click(map, { clientX: 110, clientY: 150 });
    fireEvent.keyDown(screen.getAllByLabelText("Place name")[0], {
      key: "z",
      ctrlKey: true,
    });
    expect(keys().split(",")).toHaveLength(3);
    fireEvent.keyDown(pin(1), { key: "z", ctrlKey: true });
    expect(keys()).toBe("k1,k2");
  });

  it("hides the toast after a few seconds", () => {
    vi.useFakeTimers();
    try {
      const map = setup(1);
      fireEvent.click(map, { clientX: 110, clientY: 150 });
      expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(6100);
      });
      expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("main stops and places inside", () => {
  function Harness({
    initial,
    onSeen,
  }: {
    initial: JourneyDraftStop[];
    onSeen?: (stops: JourneyDraftStop[]) => void;
  }) {
    const [stops, setStops] = useState(initial);
    return (
      <>
        <JourneyStopsEditor
          stops={stops}
          headings={[]}
          onChange={(next) => {
            onSeen?.(next);
            setStops(next);
          }}
        />
        <output data-testid="keys">
          {stops.map((s) => `${s.key}>${s.parentKey ?? ""}`).join(",")}
        </output>
      </>
    );
  }
  const sub = (n: number, parentKey: string) =>
    stop(n, { parentKey, label: `Inside ${n}` });
  const keys = () => screen.getByTestId("keys").textContent;
  const setup = (initial: JourneyDraftStop[], onSeen?: () => void) => {
    render(<Harness initial={initial} onSeen={onSeen} />);
    const map = screen.getByTestId("journey-editor-map");
    mockRect(map);
    return map;
  };
  const partOf = (card: number) =>
    screen.getAllByLabelText("Part of")[card] as HTMLSelectElement;

  it("groups cards: places inside sit under their main stop with letter numbers", () => {
    // Deliberately NOT in grouped order: the editor groups them.
    setup([stop(1), stop(2), sub(3, "k1"), sub(4, "k1")]);
    expect(screen.getAllByTestId("journey-main-card")).toHaveLength(2);
    const subs = screen.getAllByTestId("journey-sub-card");
    expect(subs).toHaveLength(2);
    expect(subs[0]).toHaveTextContent("Place 1a");
    expect(subs[1]).toHaveTextContent("Place 1b");
    // Sub cards are nested inside the first main stop's list item.
    expect(
      subs[0].closest("li")!.parentElement!.closest("li"),
    ).toContainElement(screen.getAllByTestId("journey-main-card")[0]);
  });

  it("offers Part of: Main stop or Inside each other main stop", () => {
    setup([stop(1), stop(2)]);
    const options = Array.from(partOf(0).options).map((o) => o.textContent);
    expect(options).toEqual(["Main stop", "Inside: Place 2"]);
  });

  it("puts a stop inside another via Part of, keeping it after its parent", () => {
    const seen = vi.fn();
    setup([stop(1), stop(2), stop(3)], seen);
    fireEvent.change(partOf(2), { target: { value: "k1" } });
    const last = seen.mock.calls.at(-1)![0] as JourneyDraftStop[];
    expect(last.map((s) => s.key)).toEqual(["k1", "k3", "k2"]);
    expect(last[1].parentKey).toBe("k1");
    expect(screen.getAllByTestId("journey-sub-card")).toHaveLength(1);
  });

  it("does not let a main stop with places inside become a place inside", () => {
    setup([stop(1), sub(2, "k1"), stop(3)]);
    const main1 = partOf(0);
    const inside = Array.from(main1.options).find(
      (o) => o.textContent === "Inside: Place 3",
    )!;
    expect(inside.disabled).toBe(true);
    expect(
      screen.getByText(/has places inside it, so it can't go inside/i),
    ).toBeInTheDocument();
  });

  it("disables a main stop that already holds the maximum places inside", () => {
    const subs = Array.from({ length: MAX_SUB_STOPS_PER_MAIN }, (_, i) =>
      sub(10 + i, "k1"),
    );
    setup([stop(1), stop(2), ...subs]);
    const selects = screen.getAllByLabelText("Part of");
    const select = selects[selects.length - 1] as HTMLSelectElement;
    const option = Array.from(select.options).find((o) =>
      o.textContent?.includes("Place 1"),
    )!;
    expect(option.disabled).toBe(true);
    expect(option.textContent).toMatch(/full/);
  });

  it("turns a place inside back into a main stop", () => {
    const seen = vi.fn();
    setup([stop(1), sub(2, "k1")], seen);
    fireEvent.change(partOf(1), { target: { value: "" } });
    const last = seen.mock.calls.at(-1)![0] as JourneyDraftStop[];
    expect(last.map((s) => s.parentKey ?? null)).toEqual([null, null]);
  });

  it("'Add places inside' adds map taps as places inside that main stop; Done ends it", () => {
    const seen = vi.fn();
    const map = setup([stop(1), stop(2)], seen);
    fireEvent.click(screen.getByRole("button", { name: /^Stop 2: Place 2/ }));
    fireEvent.click(screen.getByRole("button", { name: "Add places inside" }));
    expect(screen.getByTestId("journey-adding-banner")).toHaveTextContent(
      "Adding places inside Place 2",
    );
    fireEvent.click(map, { clientX: 110, clientY: 150 });
    const added = (seen.mock.calls.at(-1)![0] as JourneyDraftStop[]).at(-1)!;
    expect(added.parentKey).toBe("k2");
    expect(screen.getByText(/Added 2a inside Place 2/)).toBeInTheDocument();
    fireEvent.click(map, { clientX: 60, clientY: 90 });
    expect(
      (seen.mock.calls.at(-1)![0] as JourneyDraftStop[]).filter(
        (s) => s.parentKey === "k2",
      ),
    ).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByTestId("journey-adding-banner")).toBeNull();
    fireEvent.click(map, { clientX: 30, clientY: 40 });
    const last = seen.mock.calls.at(-1)![0] as JourneyDraftStop[];
    expect(last.at(-1)!.parentKey ?? null).toBeNull();
  });

  it("ends 'adding inside' with Escape", () => {
    setup([stop(1), stop(2)]);
    fireEvent.click(screen.getByRole("button", { name: /^Stop 1: Place 1/ }));
    fireEvent.click(screen.getByRole("button", { name: "Add places inside" }));
    fireEvent.keyDown(screen.getByTestId("journey-editor-map"), {
      key: "Escape",
    });
    expect(screen.queryByTestId("journey-adding-banner")).toBeNull();
  });

  it("only main stops offer 'Add places inside'", () => {
    setup([stop(1), sub(2, "k1")]);
    fireEvent.click(
      screen.getByRole("button", { name: /^Place 1a: Inside 2/ }),
    );
    expect(
      screen.queryByRole("button", { name: "Add places inside" }),
    ).toBeNull();
  });

  it("enforces the places-inside cap in adding mode with a friendly message", () => {
    const subs = Array.from({ length: MAX_SUB_STOPS_PER_MAIN }, (_, i) =>
      sub(10 + i, "k1"),
    );
    const seen = vi.fn();
    const map = setup([stop(1), ...subs], seen);
    // Popover button is disabled when the stop is already full.
    fireEvent.click(screen.getByRole("button", { name: /^Stop 1: Place 1/ }));
    expect(
      screen.getByRole("button", { name: "Add places inside" }),
    ).toBeDisabled();
    fireEvent.click(map, { clientX: 5, clientY: 5 });
    expect(seen).not.toHaveBeenCalled();
  });

  it("still allows places inside when the 12 main stops are used up", () => {
    const mains = Array.from({ length: MAX_JOURNEY_MAIN_STOPS }, (_, i) =>
      stop(i + 1),
    );
    const seen = vi.fn();
    const map = setup(mains, seen);
    fireEvent.click(map, { clientX: 100, clientY: 100 });
    expect(seen).not.toHaveBeenCalled(); // main stop refused
    fireEvent.click(screen.getByRole("button", { name: /^Stop 1: Place 1/ }));
    fireEvent.click(screen.getByRole("button", { name: "Add places inside" }));
    fireEvent.click(map, { clientX: 100, clientY: 100 });
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("never exceeds the total cap", () => {
    const stops: JourneyDraftStop[] = Array.from(
      { length: MAX_JOURNEY_MAIN_STOPS },
      (_, i) => stop(i + 1),
    );
    // 28 places inside spread over the first four stops (8 + 8 + 8 + 4).
    for (let n = 0; n < MAX_JOURNEY_STOPS - MAX_JOURNEY_MAIN_STOPS; n += 1) {
      stops.push(
        sub(100 + n, `k${Math.floor(n / MAX_SUB_STOPS_PER_MAIN) + 1}`),
      );
    }
    expect(stops.length).toBe(MAX_JOURNEY_STOPS);
    const seen = vi.fn();
    const map = setup(stops, seen);
    fireEvent.click(map, { clientX: 100, clientY: 100 });
    expect(seen).not.toHaveBeenCalled();
    expect(screen.getByText(/limit of 40 stops in total/i)).toBeInTheDocument();
  });

  it("removing a main stop removes its places too, with one Undo", () => {
    setup([stop(1), sub(2, "k1"), sub(3, "k1"), stop(4)]);
    fireEvent.click(screen.getByRole("button", { name: "Remove stop 1" }));
    expect(keys()).toBe("k4>");
    expect(
      screen.getByText("Removed “Place 1” and 2 places inside"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(keys()).toBe("k1>,k2>k1,k3>k1,k4>");
  });

  it("removing one place inside removes only it", () => {
    setup([stop(1), sub(2, "k1"), sub(3, "k1")]);
    fireEvent.click(screen.getByRole("button", { name: "Remove stop 1a" }));
    expect(keys()).toBe("k1>,k3>k1");
    expect(screen.getByText("Removed “Inside 2”")).toBeInTheDocument();
  });

  it("moves a place inside only within its main stop", () => {
    const seen = vi.fn();
    setup([stop(1), sub(2, "k1"), sub(3, "k1"), stop(4)], seen);
    expect(
      screen.getByRole("button", { name: "Move stop 1a up" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Move stop 1b up" }));
    expect(
      (seen.mock.calls.at(-1)![0] as JourneyDraftStop[]).map((s) => s.key),
    ).toEqual(["k1", "k3", "k2", "k4"]);
  });
});
