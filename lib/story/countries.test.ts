import { describe, expect, it } from "vitest";
import {
  countryFromPathname,
  COUNTRY_SLUGS,
  DEFAULT_COUNTRY_SLUG,
  countryMessageSegment,
  countryUrlPrefix,
  isCountrySlug,
} from "./countries";

describe("lib/story/countries", () => {
  it("defaults to new-zealand", () => {
    expect(DEFAULT_COUNTRY_SLUG).toBe("new-zealand");
  });

  it("lists exactly new-zealand and china", () => {
    expect(COUNTRY_SLUGS).toEqual(["new-zealand", "china"]);
  });

  it("isCountrySlug recognizes only the known slugs", () => {
    expect(isCountrySlug("new-zealand")).toBe(true);
    expect(isCountrySlug("china")).toBe(true);
    expect(isCountrySlug("australia")).toBe(false);
    expect(isCountrySlug("")).toBe(false);
  });

  it("New Zealand keeps its unprefixed URLs", () => {
    expect(countryUrlPrefix("new-zealand")).toBe("");
  });

  it("China lives under /cn", () => {
    expect(countryUrlPrefix("china")).toBe("/cn");
  });

  it("maps each country to its countryContent message segment", () => {
    expect(countryMessageSegment("new-zealand")).toBe("newZealand");
    expect(countryMessageSegment("china")).toBe("china");
  });

  it("countryFromPathname maps /cn and /cn/* to china, everything else to NZ", () => {
    expect(countryFromPathname("/cn")).toBe("china");
    expect(countryFromPathname("/cn/stories/abc")).toBe("china");
    expect(countryFromPathname("/")).toBe("new-zealand");
    expect(countryFromPathname("/stories")).toBe("new-zealand");
    expect(countryFromPathname("/cnx")).toBe("new-zealand");
    expect(countryFromPathname(null)).toBe("new-zealand");
  });
});
