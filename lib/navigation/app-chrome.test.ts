import { describe, expect, it } from "vitest";
import { isContributorArea, showsAppHeader, showsTabBar } from "./app-chrome";

describe("app chrome path rules", () => {
  it.each([
    "/",
    "/stories",
    "/cn/stories/x",
    "/settings",
    "/sign-in",
    "/my-stories",
    "/account",
  ])("draws the header and tab bar on %s", (path) => {
    expect(showsAppHeader(path)).toBe(true);
    expect(showsTabBar(path)).toBe(true);
  });

  it.each([
    "/moderation",
    "/editorial/1",
    "/admin",
    "/readiness",
    "/notes/x",
    "/dev/iphone-17",
    "/qa-index",
  ])("draws neither on %s", (path) => {
    expect(showsAppHeader(path)).toBe(false);
    expect(showsTabBar(path)).toBe(false);
  });

  it("keeps the header but not the tab bar on the Drive-connect step", () => {
    expect(showsAppHeader("/connect-drive")).toBe(true);
    expect(showsTabBar("/connect-drive")).toBe(false);
  });

  it("knows the contributor's own routes from the public reader ones", () => {
    expect(isContributorArea("/my-stories/map")).toBe(true);
    expect(isContributorArea("/stories/abc/edit")).toBe(true);
    expect(isContributorArea("/stories/abc")).toBe(false);
    expect(isContributorArea("/moderators")).toBe(false);
  });
});
