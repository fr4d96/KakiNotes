import { describe, expect, it } from "vitest";
import { journeyPlaceSchema } from "@/lib/journey/schema";

const ok = {
  latitude: -45.0312,
  longitude: 169.1999,
  label: " Near Cromwell ",
};

describe("journeyPlaceSchema", () => {
  it("trims the label and rounds coordinates to 2 dp", () => {
    const parsed = journeyPlaceSchema.parse(ok);
    expect(parsed.label).toBe("Near Cromwell");
    expect(parsed.latitude).toBe(-45.03);
    expect(parsed.longitude).toBe(169.2);
  });
  it("rejects coordinates outside New Zealand", () => {
    expect(
      journeyPlaceSchema.safeParse({ ...ok, latitude: -33.8 }).success,
    ).toBe(false);
    expect(
      journeyPlaceSchema.safeParse({ ...ok, longitude: 151 }).success,
    ).toBe(false);
  });
  it("requires a label of at most 60 characters", () => {
    expect(journeyPlaceSchema.safeParse({ ...ok, label: "   " }).success).toBe(
      false,
    );
    expect(
      journeyPlaceSchema.safeParse({ ...ok, label: "x".repeat(61) }).success,
    ).toBe(false);
    expect(
      journeyPlaceSchema.safeParse({ ...ok, label: "x".repeat(60) }).success,
    ).toBe(true);
  });
});
