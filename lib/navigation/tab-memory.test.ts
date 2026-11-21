import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearTabMemory,
  forgetTab,
  getTabMemorySnapshot,
  isTrackableHref,
  parseTabMemory,
  recallTab,
  rememberLocation,
  saveTabScroll,
  subscribeTabMemory,
} from "./tab-memory";

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("isTrackableHref", () => {
  it.each(["/stories", "/stories/a-b?x=1", "/cn/stories/x", "/"])(
    "accepts %s",
    (href) => expect(isTrackableHref(href)).toBe(true),
  );
  it.each([
    "https://evil.example/x",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "stories",
    "",
    "/a\nb",
    42,
    null,
  ])("rejects %s", (href) => expect(isTrackableHref(href)).toBe(false));
});

describe("tab memory", () => {
  it("remembers a location and its scroll per tab root", () => {
    rememberLocation("/stories", "/stories/some-story?tab=1");
    saveTabScroll("/stories", 420.4);
    expect(recallTab("/stories")).toEqual({
      href: "/stories/some-story?tab=1",
      scroll: 420,
    });
    expect(recallTab("/cn/stories")).toBeNull();
  });

  it("resets scroll when the location changes, keeps it when it does not", () => {
    rememberLocation("/stories", "/stories/a");
    saveTabScroll("/stories", 300);
    rememberLocation("/stories", "/stories/a");
    expect(recallTab("/stories")?.scroll).toBe(300);
    rememberLocation("/stories", "/stories/b");
    expect(recallTab("/stories")).toEqual({ href: "/stories/b", scroll: 0 });
  });

  it("refuses to store anything but in-app paths", () => {
    rememberLocation("/stories", "https://evil.example/");
    rememberLocation("/stories", "//evil.example");
    expect(recallTab("/stories")).toBeNull();
    expect(getTabMemorySnapshot()).toBe("");
  });

  it("drops tampered entries when parsing", () => {
    const raw = JSON.stringify({
      "/stories": "https://evil.example/",
      "/settings": "/settings",
    });
    expect(parseTabMemory(raw)).toEqual({ "/settings": "/settings" });
    expect(parseTabMemory("not json")).toEqual({});
    expect(parseTabMemory("")).toEqual({});
  });

  it("forgets one tab and notifies subscribers", () => {
    rememberLocation("/stories", "/stories/a");
    rememberLocation("/settings", "/settings/x");
    const listener = vi.fn();
    const off = subscribeTabMemory(listener);
    forgetTab("/stories");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(recallTab("/stories")).toBeNull();
    expect(recallTab("/settings")).not.toBeNull();
    off();
  });

  it("clears everything", () => {
    rememberLocation("/stories", "/stories/a");
    saveTabScroll("/stories", 50);
    clearTabMemory();
    expect(recallTab("/stories")).toBeNull();
    expect(getTabMemorySnapshot()).toBe("");
  });

  it("does not throw when storage is unavailable", () => {
    const spy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("denied");
      });
    const set = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("denied");
      });
    expect(() => {
      rememberLocation("/stories", "/stories/a");
      saveTabScroll("/stories", 10);
      forgetTab("/stories");
      clearTabMemory();
    }).not.toThrow();
    expect(recallTab("/stories")).toBeNull();
    spy.mockRestore();
    set.mockRestore();
  });
});
