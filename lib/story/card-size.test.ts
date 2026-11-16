import { describe, expect, it } from "vitest";
import { cardSizeFromCookieValue } from "./card-size";

describe("cardSizeFromCookieValue", () => {
  it("reads a saved choice", () => {
    expect(cardSizeFromCookieValue("small")).toBe("small");
    expect(cardSizeFromCookieValue("big")).toBe("big");
  });

  it("falls back to small cards for nothing or anything unknown", () => {
    expect(cardSizeFromCookieValue(undefined)).toBe("small");
    expect(cardSizeFromCookieValue("huge")).toBe("small");
  });
});
