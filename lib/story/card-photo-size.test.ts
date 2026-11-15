import { describe, expect, it } from "vitest";
import {
  cardPhotoSrc,
  cardPhotoSrcSet,
  parseCardPhotoWidth,
} from "./card-photo-size";

describe("card photo sizes", () => {
  it("accepts only the widths the proxy makes, written exactly", () => {
    expect(parseCardPhotoWidth("640")).toBe(640);
    expect(parseCardPhotoWidth("828")).toBe(828);
    expect(parseCardPhotoWidth("1080")).toBe(1080);
    for (const value of ["300", "640.0", "0640", "abc", "", " 640"]) {
      expect(parseCardPhotoWidth(value)).toBeNull();
    }
    expect(parseCardPhotoWidth(null)).toBeNull();
  });

  it("offers both card sizes for a /media proxy photo", () => {
    expect(cardPhotoSrc("/media/abc", 1080)).toBe("/media/abc?w=1080");
    expect(cardPhotoSrcSet("/media/abc")).toBe(
      "/media/abc?w=640 640w, /media/abc?w=828 828w, /media/abc?w=1080 1080w",
    );
  });

  it("leaves any other URL alone (a public-bucket photo has no card size)", () => {
    const url = "https://example.supabase.co/storage/v1/object/public/x.jpg";
    expect(cardPhotoSrc(url, 640)).toBe(url);
    expect(cardPhotoSrcSet(url)).toBeUndefined();
    expect(cardPhotoSrcSet("/media/abc?download=1")).toBeUndefined();
  });
});
