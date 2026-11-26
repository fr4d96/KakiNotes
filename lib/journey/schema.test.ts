import { describe, expect, it } from "vitest";
import {
  journeyPlaceSchema,
  journeyPlaceSchemaFor,
} from "@/lib/journey/schema";

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

describe("journeyPlaceSchemaFor", () => {
  it("accepts Kuala Lumpur and Kota Kinabalu for Malaysia", () => {
    const schema = journeyPlaceSchemaFor("malaysia");
    expect(
      schema.safeParse({ latitude: 3.1512, longitude: 101.711, label: "KL" })
        .success,
    ).toBe(true);
    expect(
      schema.safeParse({ latitude: 5.98, longitude: 116.07, label: "KK" })
        .success,
    ).toBe(true);
  });

  it("rejects an Auckland point for Malaysia with the out-of-bounds key", () => {
    const result = journeyPlaceSchemaFor("malaysia").safeParse({
      latitude: -36.85,
      longitude: 174.76,
      label: "Auckland",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("story.journeyOutOfBounds");
    }
  });

  it("rejects the sea between Malaysia's two panels", () => {
    const result = journeyPlaceSchemaFor("malaysia").safeParse({
      latitude: 3,
      longitude: 107,
      label: "Sea",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a Malaysian point for New Zealand", () => {
    expect(
      journeyPlaceSchemaFor("new-zealand").safeParse({
        latitude: 3.15,
        longitude: 101.71,
        label: "KL",
      }).success,
    ).toBe(false);
  });
});
