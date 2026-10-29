import { describe, expect, it } from "vitest";
import { extractHeadings } from "@/lib/story/headings";
import {
  createAnchorAllocator,
  sectionDomId,
  slugifyHeading,
} from "@/lib/story/heading-ids";

describe("slugifyHeading", () => {
  it("lower-cases, hyphenates and strips punctuation", () => {
    expect(slugifyHeading("Day 3: Milford Sound!")).toBe("day-3-milford-sound");
  });
  it("keeps non-latin letters", () => {
    expect(slugifyHeading("第一天 到达")).toBe("第一天-到达");
  });
  it("falls back for empty results", () => {
    expect(slugifyHeading("!!!")).toBe("section");
  });
});

describe("createAnchorAllocator", () => {
  it("numbers repeats in order", () => {
    const next = createAnchorAllocator();
    expect([next("Day"), next("Day"), next("Day"), next("Other")]).toEqual([
      "day",
      "day-2",
      "day-3",
      "other",
    ]);
  });
});

describe("extractHeadings", () => {
  it("finds headings in order with depth and unique anchors", () => {
    const md = "## Arrival\n\ntext\n\n### Day *one*\n\n## Arrival\n";
    expect(extractHeadings(md)).toEqual([
      { anchor: "arrival", text: "Arrival", depth: 2 },
      { anchor: "day-one", text: "Day one", depth: 3 },
      { anchor: "arrival-2", text: "Arrival", depth: 2 },
    ]);
  });
  it("ignores # inside code fences", () => {
    expect(extractHeadings("```\n## not a heading\n```\n\n## Real")).toEqual([
      { anchor: "real", text: "Real", depth: 2 },
    ]);
  });
  it("returns nothing for plain text", () => {
    expect(extractHeadings("just words")).toEqual([]);
  });
});

describe("sectionDomId", () => {
  it("prefixes so ids cannot collide with page ids", () => {
    expect(sectionDomId("arrival")).toBe("section-arrival");
  });
});
