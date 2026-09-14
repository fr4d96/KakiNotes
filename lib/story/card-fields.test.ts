import { describe, it, expect } from "vitest";
import {
  firstRegionLabel,
  stringList,
  regionNames,
  destinationNames,
} from "@/lib/story/card-fields";

describe("firstRegionLabel", () => {
  it("combines destination and region when both are present", () => {
    expect(
      firstRegionLabel([
        { region_name: "Otago", destination_name: "Queenstown" },
      ]),
    ).toBe("Queenstown, Otago");
  });

  it("falls back to just the region name when there's no destination", () => {
    expect(firstRegionLabel([{ region_name: "Otago" }])).toBe("Otago");
  });

  it("returns null for malformed input", () => {
    expect(firstRegionLabel(null)).toBeNull();
    expect(firstRegionLabel("not-an-array")).toBeNull();
    expect(firstRegionLabel([])).toBeNull();
    expect(firstRegionLabel([{}])).toBeNull();
  });
});

describe("stringList", () => {
  it("filters out non-string entries", () => {
    expect(stringList(["a", 1, null, "b"])).toEqual(["a", "b"]);
  });

  it("returns an empty array for malformed input", () => {
    expect(stringList(null)).toEqual([]);
    expect(stringList({ not: "an array" })).toEqual([]);
  });
});

describe("regionNames", () => {
  it("returns every region name a story is tagged with", () => {
    expect(
      regionNames([{ region_name: "Otago" }, { region_name: "Wellington" }]),
    ).toEqual(["Otago", "Wellington"]);
  });

  it("skips malformed entries", () => {
    expect(regionNames([{}, { region_name: "Otago" }, null])).toEqual([
      "Otago",
    ]);
  });

  it("returns an empty array for malformed input", () => {
    expect(regionNames("not-an-array")).toEqual([]);
  });
});

describe("destinationNames", () => {
  it("returns every destination name a story is tagged with", () => {
    expect(
      destinationNames([
        { region_name: "Otago", destination_name: "Queenstown" },
        { region_name: "Otago", destination_name: "Wanaka" },
      ]),
    ).toEqual(["Queenstown", "Wanaka"]);
  });

  it("skips locations that name only a region", () => {
    expect(
      destinationNames([
        { region_name: "Otago" },
        { region_name: "Otago", destination_name: "Queenstown" },
        { region_name: "Nelson", destination_name: null },
      ]),
    ).toEqual(["Queenstown"]);
  });

  it("returns an empty array for malformed input", () => {
    expect(destinationNames(null)).toEqual([]);
    expect(destinationNames("not-an-array")).toEqual([]);
  });
});

// --------------------------------------------------------------------------
// Simplified Chinese (20260914150000 put name_zh_cn on the vocabulary tables
// and the RPCs now emit it beside every English name). Every helper above
// defaults to English, which is why none of the assertions in this file
// needed changing when the locale argument was added.
// --------------------------------------------------------------------------

describe("card-fields under zh-CN", () => {
  const zhEntry = {
    region_name: "Otago",
    region_name_zh_cn: "奥塔哥",
    destination_name: "Queenstown",
    destination_name_zh_cn: "皇后镇",
  };

  it("firstRegionLabel builds the label from the Chinese names", () => {
    expect(firstRegionLabel([zhEntry], "zh-CN")).toBe("皇后镇, 奥塔哥");
  });

  it("firstRegionLabel keeps English when the locale is English", () => {
    expect(firstRegionLabel([zhEntry], "en")).toBe("Queenstown, Otago");
  });

  // A contributor-typed destination has no curated row behind it, so its
  // translation is null and it must render exactly as typed -- beside a
  // region name that IS translated.
  it("leaves a contributor-typed destination untranslated", () => {
    expect(
      firstRegionLabel(
        [
          {
            region_name: "Otago",
            region_name_zh_cn: "奥塔哥",
            destination_name: "Nan's farm",
            destination_name_zh_cn: null,
          },
        ],
        "zh-CN",
      ),
    ).toBe("Nan's farm, 奥塔哥");
  });

  it("falls back to the English region when there is no translation", () => {
    expect(
      firstRegionLabel(
        [{ region_name: "Otago", region_name_zh_cn: null }],
        "zh-CN",
      ),
    ).toBe("Otago");
  });

  it("regionNames and destinationNames return the Chinese names", () => {
    expect(regionNames([zhEntry], "zh-CN")).toEqual(["奥塔哥"]);
    expect(destinationNames([zhEntry], "zh-CN")).toEqual(["皇后镇"]);
  });

  it("skips a malformed entry instead of rendering undefined", () => {
    expect(
      regionNames([{ region_name_zh_cn: "奥塔哥" }, zhEntry], "zh-CN"),
    ).toEqual(["奥塔哥"]);
  });
});
