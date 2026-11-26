import { describe, expect, it } from "vitest";
import {
  countryFromPathname,
  COUNTRY_SLUGS,
  DEFAULT_COUNTRY_SLUG,
  countryMessageSegment,
  countryUrlPrefix,
  isCountrySlug,
  countryForPath,
  countryFromCookieValue,
  newStoryCountry,
  COUNTRY_FLAGS,
  hasJourneyMap,
  isWorkingHolidayCountry,
} from "./countries";

describe("lib/story/countries", () => {
  it("defaults to new-zealand", () => {
    expect(DEFAULT_COUNTRY_SLUG).toBe("new-zealand");
  });

  it("lists exactly new-zealand, china and malaysia", () => {
    expect(COUNTRY_SLUGS).toEqual(["new-zealand", "china", "malaysia"]);
  });

  it("puts Malaysia under /my without claiming /my-stories or /my-photos", () => {
    expect(countryUrlPrefix("malaysia")).toBe("/my");
    expect(countryFromPathname("/my")).toBe("malaysia");
    expect(countryFromPathname("/my/stories/a-trip")).toBe("malaysia");
    expect(countryFromPathname("/my-stories")).toBe("new-zealand");
    expect(countryFromPathname("/my-photos")).toBe("new-zealand");
    expect(countryForPath("/my/costs", "china")).toBe("malaysia");
    // The author's own screens follow the remembered choice.
    expect(countryForPath("/my-stories", "malaysia")).toBe("malaysia");
    expect(countryForPath("/my-stories/map", null)).toBe("new-zealand");
  });

  it("gives Malaysia its own copy, flag and a journey map, never WHV framing", () => {
    expect(countryMessageSegment("malaysia")).toBe("malaysia");
    expect(COUNTRY_FLAGS.malaysia).toBe("🇲🇾");
    expect(hasJourneyMap("malaysia")).toBe(true);
    expect(hasJourneyMap("new-zealand")).toBe(true);
    expect(hasJourneyMap("china")).toBe(false);
    expect(isWorkingHolidayCountry("malaysia")).toBe(false);
    expect(isWorkingHolidayCountry("new-zealand")).toBe(true);
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

describe("countryFromCookieValue", () => {
  it("accepts only countries we have", () => {
    expect(countryFromCookieValue("china")).toBe("china");
    expect(countryFromCookieValue("new-zealand")).toBe("new-zealand");
    expect(countryFromCookieValue("atlantis")).toBeNull();
    expect(countryFromCookieValue(undefined)).toBeNull();
  });
});

describe("countryForPath", () => {
  it("follows a country's own pages, whatever was remembered", () => {
    expect(countryForPath("/cn", "new-zealand")).toBe("china");
    expect(countryForPath("/cn/stories/x", null)).toBe("china");
    expect(countryForPath("/", "china")).toBe("new-zealand");
    expect(countryForPath("/stories", "china")).toBe("new-zealand");
    expect(countryForPath("/stories/a-story", "china")).toBe("new-zealand");
    expect(countryForPath("/contributors/kai", "china")).toBe("new-zealand");
  });

  it("uses the remembered country on pages outside both countries", () => {
    for (const path of [
      "/my-stories",
      "/my-stories/map",
      "/account",
      "/sign-in",
      "/stories/new",
      "/stories/abc/edit",
      "/stories/abc/preview",
    ]) {
      expect(countryForPath(path, "china")).toBe("china");
      expect(countryForPath(path, null)).toBe("new-zealand");
    }
  });
});

describe("newStoryCountry", () => {
  it("prefers the link's own ?country=", () => {
    expect(newStoryCountry("china", "new-zealand")).toBe("china");
  });
  it("falls back to the country picked in the header", () => {
    expect(newStoryCountry(undefined, "china")).toBe("china");
    expect(newStoryCountry("atlantis", "china")).toBe("china");
  });
  it("leaves it to the server default when neither names a real country", () => {
    expect(newStoryCountry(undefined, undefined)).toBeUndefined();
    expect(newStoryCountry("atlantis", "nope")).toBeUndefined();
  });
});
