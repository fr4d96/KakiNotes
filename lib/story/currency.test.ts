import { describe, expect, it } from "vitest";
import { DEFAULT_CURRENCY, revisionCurrency } from "@/lib/story/currency";

describe("revisionCurrency", () => {
  it("reads the revision's currency", () => {
    expect(revisionCurrency({ currency: "CNY" })).toBe("CNY");
    expect(revisionCurrency({ currency: "NZD" })).toBe("NZD");
  });

  it("falls back to NZD before the column exists, or for anything that isn't a code", () => {
    expect(DEFAULT_CURRENCY).toBe("NZD");
    expect(revisionCurrency({ title: "no currency column yet" })).toBe("NZD");
    expect(revisionCurrency({ currency: null })).toBe("NZD");
    expect(revisionCurrency({ currency: "cny" })).toBe("NZD");
    expect(revisionCurrency({ currency: "<b>" })).toBe("NZD");
    expect(revisionCurrency(null)).toBe("NZD");
  });
});
