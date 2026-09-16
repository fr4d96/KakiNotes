import { describe, expect, it } from "vitest";
import {
  getStoryStarters,
  outlineMarkdown,
  shuffleStarters,
} from "./story-starters";

describe("getStoryStarters", () => {
  it("parses both locales", () => {
    expect(() => getStoryStarters("en")).not.toThrow();
    expect(() => getStoryStarters("zh-CN")).not.toThrow();
  });

  it("has nine outline entries in both locales", () => {
    expect(getStoryStarters("en").outline).toHaveLength(9);
    expect(getStoryStarters("zh-CN").outline).toHaveLength(9);
  });

  it("has 32 prompts in both locales", () => {
    expect(getStoryStarters("en").prompts).toHaveLength(32);
    expect(getStoryStarters("zh-CN").prompts).toHaveLength(32);
  });

  it("has the same ids in the same order in both locales", () => {
    const en = getStoryStarters("en").prompts.map((p) => p.id);
    const zhCN = getStoryStarters("zh-CN").prompts.map((p) => p.id);
    expect(zhCN).toEqual(en);
  });

  it("has the same topics in the same order in both locales", () => {
    const en = getStoryStarters("en").outline.map((o) => o.topic);
    const zhCN = getStoryStarters("zh-CN").outline.map((o) => o.topic);
    expect(zhCN).toEqual(en);

    const enPromptTopics = getStoryStarters("en").prompts.map((p) => p.topic);
    const zhCNPromptTopics = getStoryStarters("zh-CN").prompts.map(
      (p) => p.topic,
    );
    expect(zhCNPromptTopics).toEqual(enPromptTopics);
  });

  it("gives every topic at least two prompts", () => {
    const { outline, prompts } = getStoryStarters("en");
    for (const { topic } of outline) {
      const count = prompts.filter((p) => p.topic === topic).length;
      expect(count).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("outlineMarkdown", () => {
  it("joins headings with a blank line and a trailing newline", () => {
    expect(
      outlineMarkdown([
        { topic: "a", heading: "A" },
        { topic: "b", heading: "B" },
      ]),
    ).toBe("## A\n\n## B\n");
  });
});

describe("shuffleStarters", () => {
  it("returns a permutation of the input without mutating it", () => {
    const items = [1, 2, 3, 4, 5];
    const original = [...items];
    // Fixed sequence of "random" values so the result is deterministic.
    const values = [0.9, 0.1, 0.5, 0.2, 0.0];
    let i = 0;
    const fixedRandom = () => values[i++ % values.length];

    const shuffled = shuffleStarters(items, fixedRandom);

    expect(items).toEqual(original);
    expect(shuffled).not.toBe(items);
    expect(shuffled.slice().sort()).toEqual(original.slice().sort());
    expect(shuffled).toHaveLength(items.length);
  });
});
