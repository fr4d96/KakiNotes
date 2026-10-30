import { describe, expect, it } from "vitest";
import en from "@/i18n/messages/en.json";
import zhCN from "@/i18n/messages/zh-CN.json";
import { pageBack, pageTitleKey } from "./page-titles";

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

describe("pageBack", () => {
  it("sends a sub-page back to its parent, keeping the country prefix", () => {
    expect(pageBack("/my-stories/map")).toEqual({
      href: "/my-stories",
      labelKey: "myStories.title",
    });
    expect(pageBack("/cn/forgot-password/")).toEqual({
      href: "/cn/sign-in",
      labelKey: "auth.signIn.title",
    });
  });

  it("gives top-level pages no back arrow", () => {
    expect(pageBack("/my-stories")).toBeNull();
    expect(pageBack("/stories")).toBeNull();
    expect(pageBack(null)).toBeNull();
  });
});

describe("pageBack for a story's own pages", () => {
  it("goes back from edit and preview, falling back to My Stories", () => {
    for (const path of ["/stories/abc-123/edit", "/stories/abc-123/preview"]) {
      expect(pageBack(path)).toEqual({
        href: "/my-stories",
        labelKey: "myStories.title",
        history: true,
      });
    }
  });

  it("goes back from a published story, falling back to Stories", () => {
    expect(pageBack("/cn/stories/queenstown-winter-8516669f")).toEqual({
      href: "/cn/stories",
      labelKey: "stories.title",
      history: true,
    });
  });

  it("leaves the new-story flow and other story routes alone", () => {
    expect(pageBack("/stories/new")?.history).toBeUndefined();
    expect(pageBack("/stories/new/import")).toEqual({
      href: "/stories/new",
      labelKey: "nav.newStory",
    });
    expect(pageBack("/stories/abc-123/export")).toBeNull();
  });
});
