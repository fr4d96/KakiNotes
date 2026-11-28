import { describe, expect, it } from "vitest";
import { searchTerms, storyMatchesSearch } from "./my-stories-search";

const story = {
  title: "Picking apples in Hawke's Bay",
  excerpt: "Six weeks on an orchard.",
  regions: [
    {
      region_name: "Hawke's Bay",
      region_name_zh_cn: "霍克斯湾",
      destination_name: "Hastings",
      destination_name_zh_cn: "黑斯廷斯",
    },
  ],
  tags: ["Fruit picking"],
};

describe("searchTerms", () => {
  it("splits on whitespace and folds case and width", () => {
    expect(searchTerms("  Apples   ＢＡＹ ", "en")).toEqual(["apples", "bay"]);
  });

  it("is empty for a blank box", () => {
    expect(searchTerms("   ", "en")).toEqual([]);
  });
});

describe("storyMatchesSearch", () => {
  const matches = (q: string, locale: "en" | "zh-CN" = "en") =>
    storyMatchesSearch(story, searchTerms(q, locale), locale);

  it("matches everything when there are no terms", () => {
    expect(matches("")).toBe(true);
  });

  it("matches title, summary, place and tag, case-insensitively", () => {
    expect(matches("APPLES")).toBe(true);
    expect(matches("orchard")).toBe(true);
    expect(matches("hastings")).toBe(true);
    expect(matches("fruit picking")).toBe(true);
  });

  it("needs every word, though each may match a different field", () => {
    expect(matches("orchard hastings")).toBe(true);
    expect(matches("orchard queenstown")).toBe(false);
  });

  it("matches place names in the page's language", () => {
    expect(matches("霍克斯湾", "zh-CN")).toBe(true);
    expect(matches("黑斯廷斯", "zh-CN")).toBe(true);
  });

  it("does not match text the story does not have", () => {
    expect(matches("glacier")).toBe(false);
  });

  it("tolerates a story with no title, summary, places or tags", () => {
    const bare = { title: null, excerpt: null, regions: null, tags: null };
    expect(storyMatchesSearch(bare, searchTerms("x", "en"), "en")).toBe(false);
    expect(storyMatchesSearch(bare, [], "en")).toBe(true);
  });
});
