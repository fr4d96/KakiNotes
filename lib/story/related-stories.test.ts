import { describe, expect, it } from "vitest";
import { pickRelatedStories, relatedScore } from "./related-stories";

const place = (region: string, destination?: string) => ({
  region_name: region,
  destination_name: destination ?? null,
});

const reading = {
  regions: [place("Otago", "Queenstown")],
  tags: ["Tourism", "Free"],
};

// Newest first, as list_published_stories returns them.
const candidates = [
  { story_id: "newest-unrelated", regions: [place("Canterbury")], tags: [] },
  { story_id: "same-region", regions: [place("Otago", "Dunedin")], tags: [] },
  { story_id: "shares-a-tag", regions: [place("Tasman")], tags: ["tourism"] },
  {
    story_id: "same-town",
    regions: [place("Otago", "Queenstown")],
    tags: ["Food"],
  },
  { story_id: "oldest-unrelated", regions: [], tags: [] },
];

describe("relatedScore", () => {
  it("weighs a shared town over a shared region over a shared tag", () => {
    expect(relatedScore(reading, candidates[3])).toBe(5); // town 3 + region 2
    expect(relatedScore(reading, candidates[1])).toBe(2);
    expect(relatedScore(reading, candidates[2])).toBe(1);
    expect(relatedScore(reading, candidates[0])).toBe(0);
  });

  it("only counts a destination as the same place within the same region", () => {
    expect(
      relatedScore(
        { regions: [place("Otago", "Springfield")] },
        { story_id: "x", regions: [place("Canterbury", "Springfield")] },
      ),
    ).toBe(0);
  });

  it("ignores case and spacing in names, and tolerates bad data", () => {
    expect(
      relatedScore(
        { tags: ["  Fruit   picking "] },
        { story_id: "x", tags: ["fruit picking"] },
      ),
    ).toBe(1);
    expect(
      relatedScore({ regions: "nope", tags: [1, null] }, candidates[3]),
    ).toBe(0);
  });
});

describe("pickRelatedStories", () => {
  it("puts the best matches first and fills with the newest after", () => {
    expect(
      pickRelatedStories(reading, candidates).map((c) => c.story_id),
    ).toEqual(["same-town", "same-region", "shares-a-tag"]);
    expect(
      pickRelatedStories(reading, candidates, { limit: 4 }).map(
        (c) => c.story_id,
      ),
    ).toEqual(["same-town", "same-region", "shares-a-tag", "newest-unrelated"]);
  });

  it("breaks ties by newest", () => {
    const tied = [
      { story_id: "newer", regions: [place("Otago")] },
      { story_id: "older", regions: [place("Otago")] },
    ];
    expect(
      pickRelatedStories({ regions: [place("Otago")] }, tied).map(
        (c) => c.story_id,
      ),
    ).toEqual(["newer", "older"]);
  });

  it("skips excluded stories before picking, so they leave no gap", () => {
    expect(
      pickRelatedStories(reading, candidates, {
        excludeIds: new Set(["same-town"]),
      }).map((c) => c.story_id),
    ).toEqual(["same-region", "shares-a-tag", "newest-unrelated"]);
  });
});
