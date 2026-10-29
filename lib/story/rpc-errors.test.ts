import { describe, expect, it } from "vitest";
import { storyFolderErrorKey, storyJourneyErrorKey } from "./rpc-errors";

describe("storyFolderErrorKey", () => {
  it.each([
    ["WHV10", "subStorySelf"],
    ["WHV11", "subStoryNotFound"],
    ["WHV13", "subStoryParentIsSubStory"],
    ["WHV14", "subStoryHasSubStories"],
    ["WHV15", "subStoryNotPublished"],
  ])("maps %s to %s", (code, key) => {
    expect(storyFolderErrorKey({ code })).toBe(key);
  });

  it.each([
    [{ code: "WHV01" }],
    // Retired free-link-only code: no longer mapped under the folder model.
    [{ code: "WHV16" }],
    [{ code: "23505" }],
    [{ code: 12 }],
    [{ message: "boom" }],
    [new Error("x")],
    [null],
    ["WHV10"],
    [undefined],
  ])("returns null for %j", (error) => {
    expect(storyFolderErrorKey(error)).toBeNull();
  });
});

describe("storyJourneyErrorKey", () => {
  it.each([
    ["WHV11", "journeyStoryNotFound"],
    ["WHV15", "journeyNotPublished"],
    ["WHV17", "journeyNotNewZealand"],
    ["WHV18", "journeyBadPlace"],
  ])("maps %s to %s", (code, key) => {
    expect(storyJourneyErrorKey({ code })).toBe(key);
  });

  it.each([
    [{ code: "WHV10" }],
    [{ code: "23505" }],
    [{ code: 18 }],
    [new Error("x")],
    [null],
    ["WHV18"],
  ])("returns null for %j", (error) => {
    expect(storyJourneyErrorKey(error)).toBeNull();
  });
});
