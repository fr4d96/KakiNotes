import { describe, expect, it } from "vitest";
import {
  DEFAULT_MY_STORIES_SORT,
  parseMyStoriesSort,
  serializeMyStoriesSort,
  sortForKey,
  sortMyStories,
  type MyStoriesSort,
  type SortableStory,
} from "./my-stories-sort";

type Row = SortableStory & { id: string };

function row(
  id: string,
  title: string | null,
  trip: string | null,
  updated = "2026-01-01T00:00:00Z",
  created = "2026-01-01T00:00:00Z",
): Row {
  return {
    id,
    title,
    trip_start_date: trip,
    updated_at: updated,
    created_at: created,
  };
}

function ids(rows: Row[], sort: MyStoriesSort, locale = "en") {
  return sortMyStories(rows, sort, locale).map((r) => r.id);
}

describe("sortMyStories", () => {
  it("sorts by title with untitled last in both directions", () => {
    const rows = [
      row("b", "Banana", null),
      row("u", null, null),
      row("a", "apple", null),
      row("blank", "   ", null),
      row("c", "Cherry", null),
    ];
    expect(ids(rows, { key: "title", direction: "asc" })).toEqual([
      "a",
      "b",
      "c",
      "u",
      "blank",
    ]);
    expect(ids(rows, { key: "title", direction: "desc" })).toEqual([
      "c",
      "b",
      "a",
      "u",
      "blank",
    ]);
  });

  it("collates titles by locale", () => {
    const rows = [row("z", "Zebra", null), row("e", "Étienne", null)];
    expect(ids(rows, { key: "title", direction: "asc" }, "en")).toEqual([
      "e",
      "z",
    ]);
  });

  it("sorts by trip year+month, missing dates last both ways", () => {
    const rows = [
      row("none", "N", null),
      row("2025-03", "A", "2025-03-10"),
      row("2026-01", "B", "2026-01-02"),
      row("2025-11", "C", "2025-11-30"),
    ];
    expect(ids(rows, { key: "tripDate", direction: "desc" })).toEqual([
      "2026-01",
      "2025-11",
      "2025-03",
      "none",
    ]);
    expect(ids(rows, { key: "tripDate", direction: "asc" })).toEqual([
      "2025-03",
      "2025-11",
      "2026-01",
      "none",
    ]);
  });

  it("sorts by trip year with title as the stable secondary", () => {
    const rows = [
      row("none", "A", null),
      row("y25b", "Bee", "2025-02-01"),
      row("y26", "Zed", "2026-02-01"),
      row("y25a", "Ant", "2025-09-01"),
    ];
    expect(ids(rows, { key: "tripYear", direction: "asc" })).toEqual([
      "y25a",
      "y25b",
      "y26",
      "none",
    ]);
    expect(ids(rows, { key: "tripYear", direction: "desc" })).toEqual([
      "y26",
      "y25a",
      "y25b",
      "none",
    ]);
  });

  it("sorts by month ignoring year, then year, then title", () => {
    const rows = [
      row("none", "A", null),
      row("dec", "D", "2024-12-01"),
      row("jan26", "J26", "2026-01-15"),
      row("jan25", "J25", "2025-01-15"),
      row("jun", "Jun", "2025-06-01"),
    ];
    expect(ids(rows, { key: "tripMonth", direction: "asc" })).toEqual([
      "jan25",
      "jan26",
      "jun",
      "dec",
      "none",
    ]);
    expect(ids(rows, { key: "tripMonth", direction: "desc" })).toEqual([
      "dec",
      "jun",
      "jan26",
      "jan25",
      "none",
    ]);
  });

  it("sorts by last edited and date created", () => {
    const rows = [
      row("old", "O", null, "2026-01-01T00:00:00Z", "2026-03-01T00:00:00Z"),
      row("new", "N", null, "2026-05-01T00:00:00Z", "2026-01-01T00:00:00Z"),
      row("mid", "M", null, "2026-03-01T00:00:00Z", "2026-02-01T00:00:00Z"),
    ];
    expect(ids(rows, { key: "updated", direction: "desc" })).toEqual([
      "new",
      "mid",
      "old",
    ]);
    expect(ids(rows, { key: "updated", direction: "asc" })).toEqual([
      "old",
      "mid",
      "new",
    ]);
    expect(ids(rows, { key: "created", direction: "asc" })).toEqual([
      "new",
      "mid",
      "old",
    ]);
    expect(ids(rows, { key: "created", direction: "desc" })).toEqual([
      "old",
      "mid",
      "new",
    ]);
  });

  it("keeps incoming order on ties and never mutates the input", () => {
    const rows = [row("1", "Same", null), row("2", "same", null)];
    const copy = [...rows];
    expect(ids(rows, { key: "title", direction: "asc" })).toEqual(["1", "2"]);
    expect(ids(rows, { key: "title", direction: "desc" })).toEqual(["1", "2"]);
    expect(rows).toEqual(copy);
  });
});

describe("parseMyStoriesSort", () => {
  it("round-trips every valid value", () => {
    const sort: MyStoriesSort = { key: "tripMonth", direction: "desc" };
    expect(parseMyStoriesSort(serializeMyStoriesSort(sort))).toEqual(sort);
  });

  it("falls back to the default for missing or invalid values", () => {
    for (const bad of [
      null,
      undefined,
      "",
      "nope",
      "title",
      "title:up",
      "x:asc",
      "title:asc:x",
    ]) {
      expect(parseMyStoriesSort(bad)).toEqual(DEFAULT_MY_STORIES_SORT);
    }
    expect(DEFAULT_MY_STORIES_SORT).toEqual({
      key: "updated",
      direction: "desc",
    });
  });
});

describe("sortForKey", () => {
  it("starts each key in its natural direction", () => {
    expect(sortForKey("title")).toEqual({ key: "title", direction: "asc" });
    expect(sortForKey("tripMonth")).toEqual({
      key: "tripMonth",
      direction: "asc",
    });
    expect(sortForKey("tripDate")).toEqual({
      key: "tripDate",
      direction: "desc",
    });
    expect(sortForKey("updated")).toEqual(DEFAULT_MY_STORIES_SORT);
  });
});
