import { describe, expect, it } from "vitest";
import {
  journeyStopSchema,
  journeyStopsSchema,
  parseStopRows,
} from "@/lib/journey/schema";

const ok = {
  latitude: -45.0312,
  longitude: 169.1999,
  label: " Near Cromwell ",
};

describe("journeyStopSchema", () => {
  it("trims the label and rounds coordinates to 2 dp", () => {
    const parsed = journeyStopSchema.parse(ok);
    expect(parsed.label).toBe("Near Cromwell");
    expect(parsed.latitude).toBe(-45.03);
    expect(parsed.longitude).toBe(169.2);
  });
  it("rejects coordinates outside New Zealand", () => {
    expect(
      journeyStopSchema.safeParse({ ...ok, latitude: -33.8 }).success,
    ).toBe(false);
    expect(journeyStopSchema.safeParse({ ...ok, longitude: 151 }).success).toBe(
      false,
    );
  });
  it("requires a label of at most 60 characters", () => {
    expect(journeyStopSchema.safeParse({ ...ok, label: "   " }).success).toBe(
      false,
    );
    expect(
      journeyStopSchema.safeParse({ ...ok, label: "x".repeat(61) }).success,
    ).toBe(false);
    expect(
      journeyStopSchema.safeParse({ ...ok, label: "x".repeat(60) }).success,
    ).toBe(true);
  });
  it("accepts a null or missing anchor but not one with spaces or #", () => {
    expect(
      journeyStopSchema.safeParse({ ...ok, sectionAnchor: null }).success,
    ).toBe(true);
    expect(journeyStopSchema.safeParse(ok).success).toBe(true);
    expect(
      journeyStopSchema.safeParse({ ...ok, sectionAnchor: "my-day" }).success,
    ).toBe(true);
    expect(
      journeyStopSchema.safeParse({ ...ok, sectionAnchor: "a b" }).success,
    ).toBe(false);
    expect(
      journeyStopSchema.safeParse({ ...ok, sectionAnchor: "#x" }).success,
    ).toBe(false);
  });
});

const sub = (parentIndex: number | null) => ({ ...ok, parentIndex });

describe("journeyStopsSchema", () => {
  it("allows 12 main stops and rejects 13", () => {
    expect(journeyStopsSchema.safeParse(Array(12).fill(ok)).success).toBe(true);
    expect(journeyStopsSchema.safeParse(Array(13).fill(ok)).success).toBe(
      false,
    );
  });
  it("accepts a sub-stop that points at an earlier main stop", () => {
    expect(
      journeyStopsSchema.safeParse([ok, sub(0), sub(0), ok, sub(3)]).success,
    ).toBe(true);
  });
  it("rejects a parent that is later, itself, out of range or already a sub-stop", () => {
    expect(journeyStopsSchema.safeParse([sub(1), ok]).success).toBe(false);
    expect(journeyStopsSchema.safeParse([ok, sub(1)]).success).toBe(false);
    expect(journeyStopsSchema.safeParse([ok, sub(5)]).success).toBe(false);
    expect(journeyStopsSchema.safeParse([ok, sub(0), sub(1)]).success).toBe(
      false,
    );
  });
  it("allows 8 sub-stops in one main stop and rejects 9", () => {
    const eight = [ok, ...Array.from({ length: 8 }, () => sub(0))];
    expect(journeyStopsSchema.safeParse(eight).success).toBe(true);
    expect(journeyStopsSchema.safeParse([...eight, sub(0)]).success).toBe(
      false,
    );
  });
  it("allows 40 stops in total and rejects 41", () => {
    const mains = Array(12).fill(ok);
    // 12 mains + 28 subs spread over several mains (max 8 each)
    const subs = Array.from({ length: 28 }, (_, i) => sub(Math.floor(i / 8)));
    expect(journeyStopsSchema.safeParse([...mains, ...subs]).success).toBe(
      true,
    );
    expect(
      journeyStopsSchema.safeParse([...mains, ...subs, sub(5)]).success,
    ).toBe(false);
  });
});

describe("parseStopRows", () => {
  it("orders by sort_order, accepts numeric strings and camel-cases", () => {
    const rows = [
      {
        sort_order: 1,
        latitude: "-41.29",
        longitude: "174.78",
        label: "B",
        section_anchor: null,
      },
      {
        sort_order: 0,
        latitude: -36.85,
        longitude: 174.76,
        label: "A",
        section_anchor: "day-one",
      },
    ];
    expect(parseStopRows(rows)).toEqual([
      {
        latitude: -36.85,
        longitude: 174.76,
        label: "A",
        sectionAnchor: "day-one",
        parentIndex: null,
      },
      {
        latitude: -41.29,
        longitude: 174.78,
        label: "B",
        sectionAnchor: null,
        parentIndex: null,
      },
    ]);
  });
  it("drops malformed and blank-label rows, and non-arrays", () => {
    expect(
      parseStopRows([
        { nope: true },
        { sort_order: 0, latitude: 1, longitude: 2, label: "  " },
      ]),
    ).toEqual([]);
    expect(parseStopRows(null)).toEqual([]);
  });
  it("maps parent_sort_order to an index into the returned array", () => {
    const row = (sort_order: number, parent: number | null) => ({
      sort_order,
      latitude: -41,
      longitude: 174,
      label: `S${sort_order}`,
      parent_sort_order: parent,
    });
    const out = parseStopRows([row(2, 0), row(0, null), row(1, null)]);
    expect(out.map((s) => [s.label, s.parentIndex])).toEqual([
      ["S0", null],
      ["S1", null],
      ["S2", 0],
    ]);
  });
  it("drops orphaned, nested and forward-pointing sub-stops", () => {
    const row = (sort_order: number, parent: number | null, label = "x") => ({
      sort_order,
      latitude: -41,
      longitude: 174,
      label: `${label}${sort_order}`,
      parent_sort_order: parent,
    });
    const out = parseStopRows([
      row(0, null),
      row(1, 0), // fine
      row(2, 1), // nested under a sub-stop: dropped
      row(3, 9), // orphan: parent missing
      row(4, 6), // forward pointer: dropped
      row(5, null),
      row(6, null),
    ]);
    expect(out.map((s) => s.label)).toEqual(["x0", "x1", "x5", "x6"]);
    expect(out.map((s) => s.parentIndex)).toEqual([null, 0, null, null]);
  });
  it("drops a sub-stop whose parent row was malformed", () => {
    const out = parseStopRows([
      { sort_order: 0, latitude: "bad", longitude: 1, label: "Main" },
      {
        sort_order: 1,
        latitude: -41,
        longitude: 174,
        label: "Sub",
        parent_sort_order: 0,
      },
    ]);
    expect(out).toEqual([]);
  });
});
