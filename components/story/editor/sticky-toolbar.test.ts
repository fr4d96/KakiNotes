import { describe, expect, it } from "vitest";

import {
  stickyChromeBottom,
  toolbarScrollMargin,
  toolbarStickyTop,
} from "./sticky-toolbar";

describe("stickyChromeBottom", () => {
  it("is the lowest stuck edge of the stacked bars", () => {
    // iPhone 17 in the installed app: header 76px + 62px safe area at top 0,
    // the wizard step bar stuck under it at 138px.
    expect(
      stickyChromeBottom([
        { top: 0, height: 138 },
        { top: 138, height: 139 },
      ]),
    ).toBe(277);
  });

  it("ignores hidden bars and unresolvable tops, and is 0 with no bars", () => {
    expect(stickyChromeBottom([])).toBe(0);
    expect(
      stickyChromeBottom([
        { top: 0, height: 76 },
        { top: Number.NaN, height: 200 },
        { top: 76, height: 0 },
      ]),
    ).toBe(76);
  });
});

describe("toolbarStickyTop", () => {
  it("sits under the chrome normally", () => {
    expect(toolbarStickyTop(277, 0)).toBe(277);
  });

  it("follows the visual viewport down when the iOS keyboard pans it past the chrome", () => {
    expect(toolbarStickyTop(277, 412.4)).toBe(412);
  });

  it("never goes negative", () => {
    expect(toolbarStickyTop(0, -30)).toBe(0);
  });
});

describe("toolbarScrollMargin", () => {
  it("keeps the caret 8px below the toolbar's bottom edge", () => {
    const toolbar = {
      getBoundingClientRect: () => ({ bottom: 333.6 }) as DOMRect,
    } as HTMLElement;
    expect(toolbarScrollMargin(toolbar)).toBe(342);
  });

  it("is 0 without a toolbar, or once it has scrolled off the top", () => {
    expect(toolbarScrollMargin(null)).toBe(0);
    const gone = {
      getBoundingClientRect: () => ({ bottom: -40 }) as DOMRect,
    } as HTMLElement;
    expect(toolbarScrollMargin(gone)).toBe(0);
  });
});
