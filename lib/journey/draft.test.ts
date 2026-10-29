import { describe, expect, it } from "vitest";
import {
  canMove,
  moveAmongSiblings,
  normalizeStops,
  removeWithChildren,
  stopIds,
  toParentIndexes,
} from "@/lib/journey/draft";

const s = (key: string, parentKey: string | null = null) => ({
  key,
  parentKey,
});
const keys = (list: Array<{ key: string }>) => list.map((x) => x.key);

describe("normalizeStops", () => {
  it("puts each main stop's sub-stops straight after it, keeping order", () => {
    const out = normalizeStops([s("a"), s("b"), s("a1", "a"), s("a2", "a")]);
    expect(keys(out)).toEqual(["a", "a1", "a2", "b"]);
  });
  it("drops sub-stops whose parent is missing or is itself a sub-stop", () => {
    const out = normalizeStops([
      s("a"),
      s("a1", "a"),
      s("x", "gone"),
      s("a1x", "a1"),
    ]);
    expect(keys(out)).toEqual(["a", "a1"]);
  });
  it("treats an undefined parentKey as a main stop", () => {
    expect(keys(normalizeStops([{ key: "a" }, { key: "b" }]))).toEqual([
      "a",
      "b",
    ]);
  });
});

describe("stopIds and toParentIndexes", () => {
  const list = normalizeStops([s("a"), s("b"), s("b1", "b"), s("b2", "b")]);
  it("numbers mains and letters their sub-stops", () => {
    expect(stopIds(list)).toEqual(["1", "2", "2a", "2b"]);
  });
  it("gives array positions of parents", () => {
    expect(toParentIndexes(list)).toEqual([null, null, 1, 1]);
  });
});

describe("removeWithChildren", () => {
  it("removing a main stop removes its sub-stops too", () => {
    const list = normalizeStops([s("a"), s("a1", "a"), s("b"), s("b1", "b")]);
    const { next, removed } = removeWithChildren(list, "a");
    expect(keys(next)).toEqual(["b", "b1"]);
    expect(keys(removed)).toEqual(["a", "a1"]);
  });
  it("removing a sub-stop removes only it", () => {
    const list = normalizeStops([s("a"), s("a1", "a"), s("a2", "a")]);
    expect(keys(removeWithChildren(list, "a1").next)).toEqual(["a", "a2"]);
  });
});

describe("moveAmongSiblings", () => {
  const list = normalizeStops([s("a"), s("a1", "a"), s("b"), s("b1", "b")]);
  it("moves a main stop together with its sub-stops", () => {
    expect(keys(moveAmongSiblings(list, "b", -1)!)).toEqual([
      "b",
      "b1",
      "a",
      "a1",
    ]);
  });
  it("moves a sub-stop only within its own main stop", () => {
    const two = normalizeStops([s("a"), s("a1", "a"), s("a2", "a"), s("b")]);
    expect(keys(moveAmongSiblings(two, "a2", -1)!)).toEqual([
      "a",
      "a2",
      "a1",
      "b",
    ]);
  });
  it("returns null at the ends", () => {
    expect(canMove(list, "a", -1)).toBe(false);
    expect(canMove(list, "b", 1)).toBe(false);
    expect(canMove(list, "a1", 1)).toBe(false);
    expect(canMove(list, "a", 1)).toBe(true);
  });
});
