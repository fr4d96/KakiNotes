import { describe, expect, it } from "vitest";
import en from "@/i18n/messages/en.json";
import zhCN from "@/i18n/messages/zh-CN.json";
import { pageTitleKey } from "./page-titles";

function lookup(messages: unknown, key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === "object"
          ? (node as Record<string, unknown>)[part]
          : undefined,
      messages,
    );
}

describe("pageTitleKey", () => {
  it("names label pages, with or without the country prefix", () => {
    expect(pageTitleKey("/my-stories")).toBe("myStories.title");
    expect(pageTitleKey("/stories")).toBe("stories.title");
    expect(pageTitleKey("/cn/stories")).toBe("stories.title");
    expect(pageTitleKey("/my-stories/")).toBe("myStories.title");
  });

  it("leaves pages whose heading IS the content on the wordmark", () => {
    for (const path of [
      "/",
      "/cn",
      "/stories/some-story-slug",
      "/contributors/some-contributor",
      "/stories/2f1c0000-0000-4000-8000-000000000000/edit",
      "/reset-password",
      null,
    ]) {
      expect(pageTitleKey(path)).toBeNull();
    }
  });

  it("only points at keys that exist in every language", () => {
    const paths = [
      "/stories",
      "/contributors",
      "/costs",
      "/about",
      "/privacy",
      "/terms",
      "/community-guidelines",
      "/copyright",
      "/sign-in",
      "/sign-up",
      "/forgot-password",
      "/my-stories",
      "/my-stories/map",
      "/my-stories/journey",
      "/my-photos",
      "/notifications",
      "/account",
      "/stories/new",
      "/stories/new/import",
    ];
    for (const path of paths) {
      const key = pageTitleKey(path)!;
      expect(key, path).toBeTruthy();
      expect(typeof lookup(en, key), `${path} en`).toBe("string");
      expect(typeof lookup(zhCN, key), `${path} zh-CN`).toBe("string");
    }
  });
});
