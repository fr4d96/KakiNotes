import { describe, expect, it } from "vitest";
import {
  getStoryStarters,
  outlineMarkdown,
  seededRandom,
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

describe("seededRandom", () => {
  it("returns the same sequence for the same seed", () => {
    const a = seededRandom("story-1");
    const b = seededRandom("story-1");
    const seqA = Array.from({ length: 20 }, a);
    const seqB = Array.from({ length: 20 }, b);
    expect(seqA).toEqual(seqB);
  });

  it("stays within [0, 1)", () => {
    const next = seededRandom("0b6e9f2c-4a1d-4c3e-9f7a-2d5b8c1e0a3f");
    for (let i = 0; i < 1000; i += 1) {
      const value = next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("gives the same shuffle for the same seed and varies across seeds", () => {
    const { prompts } = getStoryStarters("en");
    const ids = prompts.map((p) => p.id);
    const first = (seed: string) => shuffleStarters(ids, seededRandom(seed))[0];

    // Server render and client hydration both do this -- they must agree.
    expect(shuffleStarters(ids, seededRandom("story-1"))).toEqual(
      shuffleStarters(ids, seededRandom("story-1")),
    );

    // Different stories should not all open on the same prompt.
    const firstPrompts = new Set(
      Array.from({ length: 20 }, (_, i) => first(`story-${i}`)),
    );
    expect(firstPrompts.size).toBeGreaterThan(1);
  });
});
