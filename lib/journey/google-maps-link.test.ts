import { describe, expect, it } from "vitest";
import { parseGoogleMapsUrl } from "./google-maps-link";

describe("parseGoogleMapsUrl", () => {
  it("prefers the place pin (!3d!4d) over the @ viewport centre", () => {
    const url =
      "https://www.google.com/maps/place/Lake+Tekapo/@-44.0,170.5,12z/data=!3m1!4b1!4m6!3m5!1s0x6d2a:0x1!8m2!3d-44.0049!4d170.4777!16zL20";
    expect(parseGoogleMapsUrl(url)).toEqual({
      latitude: -44.0049,
      longitude: 170.4777,
      placeName: "Lake Tekapo",
    });
  });

  it("decodes unicode and percent-encoded names", () => {
    const url =
      "https://www.google.co.nz/maps/place/W%C4%81naka/@-44.7,169.13,12z/data=!8m2!3d-44.7032!4d169.1321";
    expect(parseGoogleMapsUrl(url)).toMatchObject({
      latitude: -44.7032,
      longitude: 169.1321,
      placeName: "Wānaka",
    });
  });

  it("handles %2B, commas and spaces in names", () => {
    const url =
      "https://www.google.com/maps/place/Mt+Cook+Village,+Canterbury/@-43.7,170.1,14z";
    expect(parseGoogleMapsUrl(url)?.placeName).toBe(
      "Mt Cook Village, Canterbury",
    );
  });

  it("reads api=1 search and query parameters", () => {
    expect(
      parseGoogleMapsUrl(
        "https://www.google.com/maps/search/?api=1&query=-45.03%2C168.66",
      ),
    ).toEqual({ latitude: -45.03, longitude: 168.66, placeName: null });
    expect(
      parseGoogleMapsUrl(
        "https://www.google.com.my/maps/dir/?api=1&destination=-36.85,174.76",
      ),
    ).toMatchObject({ latitude: -36.85, longitude: 174.76 });
    expect(
      parseGoogleMapsUrl("https://maps.google.com/maps?ll=-41.29,174.78&z=10"),
    ).toMatchObject({ latitude: -41.29, longitude: 174.78 });
  });

  it("reads ?q=lat,lng and uses a non-coordinate q as the name", () => {
    expect(
      parseGoogleMapsUrl("https://www.google.com/maps?q=-38.14,176.25"),
    ).toEqual({ latitude: -38.14, longitude: 176.25, placeName: null });
    expect(
      parseGoogleMapsUrl(
        "https://www.google.com/maps?q=Rotorua&ll=-38.14,176.25",
      ),
    ).toEqual({ latitude: -38.14, longitude: 176.25, placeName: "Rotorua" });
  });

  it("prefers query parameters over the viewport centre", () => {
    expect(
      parseGoogleMapsUrl(
        "https://www.google.com/maps/search/?api=1&query=-45.03,168.66&x=1/@-10,10,5z",
      ),
    ).toMatchObject({ latitude: -45.03 });
  });

  it("falls back to a plain @ view, with and without a place name", () => {
    expect(
      parseGoogleMapsUrl("https://www.google.com/maps/@-43.53,172.63,11z"),
    ).toEqual({ latitude: -43.53, longitude: 172.63, placeName: null });
    expect(
      parseGoogleMapsUrl(
        "https://www.google.com/maps/place/-43.53,172.63/@-43.53,172.63,15z",
      ),
    ).toEqual({ latitude: -43.53, longitude: 172.63, placeName: null });
  });

  it("accepts other google tlds and maps.google", () => {
    expect(
      parseGoogleMapsUrl("https://google.com.my/maps/@-43.5,172.6,9z"),
    ).not.toBeNull();
    expect(
      parseGoogleMapsUrl("https://maps.google.co.nz/maps/@-43.5,172.6,9z"),
    ).not.toBeNull();
  });

  it("rejects out-of-range numbers and links without coordinates", () => {
    expect(
      parseGoogleMapsUrl("https://www.google.com/maps/@-143.5,172.6,9z"),
    ).toBeNull();
    expect(
      parseGoogleMapsUrl("https://www.google.com/maps?q=1,500"),
    ).toBeNull();
    expect(
      parseGoogleMapsUrl("https://www.google.com/maps/place/Nowhere"),
    ).toBeNull();
  });

  it("rejects non-Google hosts, http, other schemes, credentials, ports, garbage", () => {
    const bad = [
      "https://evil.example/maps/@-43.5,172.6,9z",
      "https://google.com.evil.example/maps/@-43.5,172.6,9z",
      "https://notgoogle.com/maps/@-43.5,172.6,9z",
      "http://www.google.com/maps/@-43.5,172.6,9z",
      "javascript:alert(1)",
      "https://user:pw@www.google.com/maps/@-43.5,172.6,9z",
      "https://www.google.com:8443/maps/@-43.5,172.6,9z",
      "https://www.google.com/search?q=-43.5,172.6",
      "https://www.google.com/mapsfoo/@-43.5,172.6,9z",
      "https://maps.app.goo.gl/abc123",
      "not a url",
      "",
    ];
    for (const input of bad) expect(parseGoogleMapsUrl(input)).toBeNull();
  });

  it("trims surrounding whitespace", () => {
    expect(
      parseGoogleMapsUrl("  https://www.google.com/maps/@-43.5,172.6,9z\n"),
    ).not.toBeNull();
  });
});
