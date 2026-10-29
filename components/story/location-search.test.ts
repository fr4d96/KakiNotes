import { describe, expect, it } from "vitest";
import { matchLocation } from "./location-search";

const regions = [
  {
    id: "r-northland",
    name: "Northland",
    slug: "northland",
    islandOrGrouping: "North Island",
    name_zh_cn: null,
    countrySlug: "new-zealand",
  },
  {
    id: "r-otago",
    name: "Otago",
    slug: "otago",
    islandOrGrouping: "South Island",
    name_zh_cn: null,
    countrySlug: "new-zealand",
  },
];
const destinations = [
  {
    id: "d-queenstown",
    name: "Queenstown",
    slug: "queenstown",
    regionId: "r-otago",
    name_zh_cn: null,
  },
];

const chinaRegions = [
  {
    id: "r-guangdong",
    name: "Guangdong",
    slug: "guangdong",
    islandOrGrouping: null,
    name_zh_cn: "广东",
    countrySlug: "china",
  },
  {
    id: "r-beijing",
    name: "Beijing",
    slug: "beijing-municipality",
    islandOrGrouping: null,
    name_zh_cn: "北京",
    countrySlug: "china",
  },
];
const chinaDestinations = [
  {
    id: "d-guangzhou",
    name: "Guangzhou",
    slug: "guangzhou",
    regionId: "r-guangdong",
    name_zh_cn: "广州",
  },
];

describe("matchLocation", () => {
  it("uses the destinations row when the place is one we seeded", () => {
    const match = matchLocation(
      { town: "Queenstown", state: "Otago" },
      regions,
      destinations,
      "Queenstown",
    );
    expect(match).toEqual({
      regionId: "r-otago",
      destinationId: "d-queenstown",
      // A real lookup row is the better record; the two are mutually
      // exclusive in the database.
      customDestinationLabel: null,
    });
  });

  it("keeps the place name when the map found it but we did not seed it", () => {
    // The case behind 10 of the 13 location rows recorded before this: the
    // region matched, the town did not, and the town name was thrown away.
    const match = matchLocation(
      { town: "Kaikohe", state: "Northland" },
      regions,
      destinations,
      "Kaikohe",
    );
    expect(match).toEqual({
      regionId: "r-northland",
      destinationId: null,
      customDestinationLabel: "Kaikohe",
    });
  });

  it("prefers the name that was clicked over a broader locality field", () => {
    // Real Nominatim behaviour: picking "Kaikohe" returns an address whose
    // most specific locality is the wider community, which is accurate and
    // not what anyone typed.
    const match = matchLocation(
      { suburb: "Kaikohe-Hokianga Community", state: "Northland" },
      regions,
      destinations,
      "Kaikohe",
    );
    expect(match?.customDestinationLabel).toBe("Kaikohe");
  });

  it("falls back to the address locality when no clicked name is given", () => {
    const match = matchLocation(
      { village: "Hikurangi", state: "Northland" },
      regions,
      destinations,
    );
    expect(match?.customDestinationLabel).toBe("Hikurangi");
  });

  it("returns null when even the region cannot be matched", () => {
    // Region is a closed set of 16; something outside New Zealand has no
    // home here, and the editor asks the contributor to pick manually.
    expect(
      matchLocation(
        { town: "Sydney", state: "New South Wales" },
        regions,
        destinations,
      ),
    ).toBeNull();
  });

  it("matches a region with no locality at all", () => {
    const match = matchLocation({ state: "Otago" }, regions, destinations);
    expect(match).toEqual({
      regionId: "r-otago",
      destinationId: null,
      // Region-only is valid and always has been.
      customDestinationLabel: null,
    });
  });
});

// China's regions are provinces/municipalities, and Nominatim's `state`
// field for them carries an administrative suffix ("Guangdong Province",
// "Beijing Municipality"/"北京市") that the curated `regions` rows never
// do (seeded plain "Guangdong"/"Beijing" in
// supabase/migrations/20260924021909_countries.sql). These are fixture
// results, not live network calls -- no fetch happens in this file at all.
describe("matchLocation — tolerant Chinese region matching", () => {
  it("matches an English 'Province' suffix", () => {
    const match = matchLocation(
      { city: "Guangzhou", state: "Guangdong Province" },
      chinaRegions,
      chinaDestinations,
      "Guangzhou",
    );
    expect(match).toEqual({
      regionId: "r-guangdong",
      destinationId: "d-guangzhou",
      customDestinationLabel: null,
    });
  });

  it("matches an English 'Municipality' suffix with no destination row", () => {
    const match = matchLocation(
      { city: "Chaoyang", state: "Beijing Municipality" },
      chinaRegions,
      chinaDestinations,
      "Chaoyang",
    );
    expect(match).toEqual({
      regionId: "r-beijing",
      destinationId: null,
      customDestinationLabel: "Chaoyang",
    });
  });

  it("matches a Simplified Chinese '省' (province) suffix against name_zh_cn", () => {
    const match = matchLocation(
      { city: "广州", state: "广东省" },
      chinaRegions,
      chinaDestinations,
      "广州",
    );
    expect(match?.regionId).toBe("r-guangdong");
  });

  it("matches a Simplified Chinese '市' (municipality) suffix against name_zh_cn", () => {
    const match = matchLocation(
      { state: "北京市" },
      chinaRegions,
      chinaDestinations,
    );
    expect(match?.regionId).toBe("r-beijing");
  });

  it("matches the Chinese destination name via name_zh_cn", () => {
    const match = matchLocation(
      { city: "广州", state: "广东省" },
      chinaRegions,
      chinaDestinations,
      "广州",
    );
    expect(match?.destinationId).toBe("d-guangzhou");
  });
});
