import { describe, it, expect } from "vitest";
import {
  vocabName,
  prefixedVocabName,
  sortByLocalizedName,
} from "@/lib/i18n/vocab";

describe("vocabName", () => {
  it("returns the English name for the English locale, translation or not", () => {
    expect(vocabName({ name: "Auckland", name_zh_cn: "奥克兰" }, "en")).toBe(
      "Auckland",
    );
  });

  it("returns the Chinese name for zh-CN when one exists", () => {
    expect(vocabName({ name: "Auckland", name_zh_cn: "奥克兰" }, "zh-CN")).toBe(
      "奥克兰",
    );
  });

  // The case that protects contributor writing: a typed label arrives with a
  // null twin, so it renders exactly as its author typed it.
  it("falls back to the English name when the translation is null", () => {
    expect(vocabName({ name: "Nan's farm", name_zh_cn: null }, "zh-CN")).toBe(
      "Nan's farm",
    );
  });

  it("falls back when the translation is absent entirely", () => {
    expect(vocabName({ name: "Golden Bay" }, "zh-CN")).toBe("Golden Bay");
  });

  it("treats a whitespace-only translation as no translation", () => {
    expect(vocabName({ name: "Otago", name_zh_cn: "   " }, "zh-CN")).toBe(
      "Otago",
    );
  });

  it("returns an empty string for a missing row rather than throwing", () => {
    expect(vocabName(null, "zh-CN")).toBe("");
    expect(vocabName(undefined, "en")).toBe("");
  });
});

describe("prefixedVocabName", () => {
  const entry = {
    region_name: "Otago",
    region_name_zh_cn: "奥塔哥",
    destination_name: "Queenstown",
    destination_name_zh_cn: "皇后镇",
  };

  it("reads the prefixed English keys under en", () => {
    expect(prefixedVocabName(entry, "region", "en")).toBe("Otago");
    expect(prefixedVocabName(entry, "destination", "en")).toBe("Queenstown");
  });

  it("reads the prefixed Chinese keys under zh-CN", () => {
    expect(prefixedVocabName(entry, "region", "zh-CN")).toBe("奥塔哥");
    expect(prefixedVocabName(entry, "destination", "zh-CN")).toBe("皇后镇");
  });

  it("falls back to English when only the twin is missing", () => {
    expect(
      prefixedVocabName(
        { destination_name: "Nan's farm", destination_name_zh_cn: null },
        "destination",
        "zh-CN",
      ),
    ).toBe("Nan's farm");
  });

  it("returns null when the English key is missing, empty or not a string", () => {
    expect(
      prefixedVocabName({ region_name_zh_cn: "奥塔哥" }, "region", "zh-CN"),
    ).toBeNull();
    expect(prefixedVocabName({ region_name: "" }, "region", "en")).toBeNull();
    expect(prefixedVocabName({ region_name: 42 }, "region", "en")).toBeNull();
  });

  it("returns null for a non-object entry rather than throwing", () => {
    expect(prefixedVocabName(null, "region", "en")).toBeNull();
    expect(prefixedVocabName("Otago", "region", "en")).toBeNull();
    expect(prefixedVocabName(undefined, "region", "zh-CN")).toBeNull();
  });

  it("ignores a non-string translation and uses the English name", () => {
    expect(
      prefixedVocabName(
        { region_name: "Otago", region_name_zh_cn: 7 },
        "region",
        "zh-CN",
      ),
    ).toBe("Otago");
  });
});

describe("sortByLocalizedName", () => {
  const rows = [
    { name: "Otago", name_zh_cn: "奥塔哥" },
    { name: "Auckland", name_zh_cn: "奥克兰" },
    { name: "Canterbury", name_zh_cn: "坎特伯雷" },
  ];

  // English keeps whatever order the database gave, which is already
  // `order by name` in SQL -- re-sorting could reorder ties differently.
  it("leaves English order exactly as received", () => {
    expect(sortByLocalizedName(rows, "en").map((r) => r.name)).toEqual([
      "Otago",
      "Auckland",
      "Canterbury",
    ]);
  });

  it("orders zh-CN by the Chinese name, not the English one", () => {
    const sorted = sortByLocalizedName(rows, "zh-CN").map((r) => r.name_zh_cn);
    const collator = new Intl.Collator("zh-CN", {
      collation: "pinyin",
      sensitivity: "base",
    });
    expect(sorted).toEqual(
      [...sorted].sort((a, b) => collator.compare(a!, b!)),
    );
  });

  it("sorts an untranslated row by the English name it falls back to", () => {
    const mixed = [
      { name: "Zebra Flat", name_zh_cn: null },
      { name: "Auckland", name_zh_cn: "奥克兰" },
    ];
    expect(sortByLocalizedName(mixed, "zh-CN")).toHaveLength(2);
  });

  it("does not mutate the input array", () => {
    const input = [...rows];
    sortByLocalizedName(input, "zh-CN");
    expect(input.map((r) => r.name)).toEqual([
      "Otago",
      "Auckland",
      "Canterbury",
    ]);
  });
});
