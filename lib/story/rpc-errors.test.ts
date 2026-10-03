import { describe, expect, it } from "vitest";
import { subStoryErrorKey } from "./rpc-errors";

describe("subStoryErrorKey", () => {
  it.each([
    ["WHV10", "subStorySelf"],
    ["WHV11", "subStoryNotFound"],
    ["WHV12", "subStoryParentNotPublished"],
    ["WHV13", "subStoryParentIsSubStory"],
    ["WHV14", "subStoryHasSubStories"],
    ["WHV15", "subStoryNotPublished"],
  ])("maps %s to %s", (code, key) => {
    expect(subStoryErrorKey({ code })).toBe(key);
  });

  it.each([
    [{ code: "WHV01" }],
    [{ code: "23505" }],
    [{ code: 12 }],
    [{ message: "boom" }],
    [new Error("x")],
    [null],
    ["WHV10"],
    [undefined],
  ])("returns null for %j", (error) => {
    expect(subStoryErrorKey(error)).toBeNull();
  });
});
