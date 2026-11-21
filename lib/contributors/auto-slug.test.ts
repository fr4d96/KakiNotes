import { describe, expect, it } from "vitest";
import { baseSlugFromName, slugCandidates } from "@/lib/contributors/auto-slug";

const SLUG = /^[a-z0-9][a-z0-9-]{2,59}$/;

describe("baseSlugFromName", () => {
  it.each([
    ["Kaki Ku", "kaki-ku"],
    ["  José   Ñúñez! ", "jose-nunez"],
    ["--Mun__Jeng--", "mun-jeng"],
    ["Bo", "contributor"],
    ["小明", "contributor"],
    ["😀😀😀", "contributor"],
  ])("%j -> %j", (name, slug) => {
    expect(baseSlugFromName(name)).toBe(slug);
  });

  it("caps a long name without leaving a trailing hyphen", () => {
    const slug = baseSlugFromName(`${"a".repeat(49)} bcd`);
    expect(slug.length).toBeLessThanOrEqual(50);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("slugCandidates", () => {
  it("tries the name, then -2 to -9, then one random suffix", () => {
    const list = slugCandidates("Kaki Ku", () => 0);
    expect(list[0]).toBe("kaki-ku");
    expect(list.slice(1, 9)).toEqual(
      Array.from({ length: 8 }, (_, i) => `kaki-ku-${i + 2}`),
    );
    expect(list[9]).toBe("kaki-ku-0000");
  });

  it("only ever produces valid page addresses", () => {
    for (const name of ["x", "A".repeat(200), "Ünïcödé Nämé", "小明 Lee"]) {
      for (const slug of slugCandidates(name)) expect(slug).toMatch(SLUG);
    }
  });
});
