import { describe, expect, it } from "vitest";
import {
  buildJourneyStops,
  groupMyJourney,
  parsePublishedJourneyRows,
  type PublishedJourneyRow,
} from "@/lib/journey/contributor-journey";

function row(
  id: string,
  extra: Partial<PublishedJourneyRow> = {},
): PublishedJourneyRow {
  return {
    story_id: id,
    slug: `slug-${id}`,
    title: `Story ${id}`,
    excerpt: null,
    parent_story_id: null,
    journey_label: `Place ${id}`,
    journey_latitude: -41.29,
    journey_longitude: 174.78,
    trip_start_date: null,
    ...extra,
  };
}

describe("parsePublishedJourneyRows", () => {
  it("coerces numeric strings and drops rows that do not parse", () => {
    const rows = parsePublishedJourneyRows([
      {
        story_id: "a",
        slug: "a",
        title: "A",
        journey_label: "Auckland",
        journey_latitude: "-36.85",
        journey_longitude: "174.76",
      },
      {
        story_id: "b",
        slug: "b",
        title: "B",
        journey_label: "No coords",
        journey_latitude: null,
        journey_longitude: null,
      },
      { nonsense: true },
      {
        story_id: "c",
        slug: "c",
        title: "C",
        journey_label: "  ",
        journey_latitude: 1,
        journey_longitude: 1,
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].journey_latitude).toBe(-36.85);
    expect(rows[0].journey_longitude).toBe(174.76);
  });
  it("returns [] for non-arrays", () => {
    expect(parsePublishedJourneyRows(null)).toEqual([]);
    expect(parsePublishedJourneyRows({})).toEqual([]);
  });
});

describe("buildJourneyStops", () => {
  it("maps rows to story-linked main stops in trip order", () => {
    const stops = buildJourneyStops([row("a"), row("b")]);
    expect(stops.map((s) => s.label)).toEqual(["Place a", "Place b"]);
    expect(stops[0]).toMatchObject({
      storyTitle: "Story a",
      href: "/stories/slug-a",
      parentIndex: null,
    });
  });

  it("puts sub pins right after their main pin with an earlier parentIndex", () => {
    const stops = buildJourneyStops([
      row("a"),
      row("b"),
      row("a1", { parent_story_id: "a" }),
      row("b1", { parent_story_id: "b" }),
      row("a2", { parent_story_id: "a" }),
    ]);
    expect(stops.map((s) => s.label)).toEqual([
      "Place a",
      "Place a1",
      "Place a2",
      "Place b",
      "Place b1",
    ]);
    expect(stops.map((s) => s.parentIndex)).toEqual([null, 0, 0, null, 3]);
    stops.forEach((s, i) => {
      if (s.parentIndex !== null) {
        expect(s.parentIndex).toBeLessThan(i);
        expect(stops[s.parentIndex].parentIndex).toBeNull();
      }
    });
  });

  it("treats a sub story whose main story is not in the set as a main pin", () => {
    const stops = buildJourneyStops([row("x", { parent_story_id: "gone" })]);
    expect(stops).toHaveLength(1);
    expect(stops[0].parentIndex).toBeNull();
  });

  it("never nests twice or loops on itself", () => {
    const stops = buildJourneyStops([
      row("a"),
      row("b", { parent_story_id: "a" }),
      row("c", { parent_story_id: "b" }),
      row("d", { parent_story_id: "d" }),
    ]);
    expect(stops.map((s) => s.parentIndex)).toEqual([null, 0, null, null]);
  });

  it("returns [] for no rows", () => {
    expect(buildJourneyStops([])).toEqual([]);
  });

  it("encodes the slug in the story link", () => {
    expect(buildJourneyStops([row("a", { slug: "a b" })])[0].href).toBe(
      "/stories/a%20b",
    );
  });
});

describe("groupMyJourney", () => {
  const base = {
    pinnable: true,
    isNewZealand: true,
    place: null,
  } as const;
  const e = (
    id: string,
    lifecycleStatus: string,
    parentStoryId: string | null = null,
  ) => ({ ...base, id, slug: id, title: id, lifecycleStatus, parentStoryId });

  it("keeps published stories only, each main with its published sub stories", () => {
    const groups = groupMyJourney([
      e("main", "published"),
      e("sub", "published", "main"),
      e("draft-sub", "draft", "main"),
      e("draft", "draft"),
    ]);
    expect(groups.map((g) => [g.main.id, g.subs.map((s) => s.id)])).toEqual([
      ["main", ["sub"]],
    ]);
  });

  it("lets a published sub story of an unpublished main stand alone", () => {
    const groups = groupMyJourney([
      e("main", "draft"),
      e("sub", "published", "main"),
    ]);
    expect(groups.map((g) => g.main.id)).toEqual(["sub"]);
  });
});
