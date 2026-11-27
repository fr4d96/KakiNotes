import { describe, expect, it } from "vitest";
import { notificationsCursorSchema } from "./notifications";

describe("notificationsCursorSchema", () => {
  const id = "3f2b8c1e-7d4a-4b6e-9a1f-2c3d4e5f6a7b";

  it("accepts the timestamp exactly as Postgres returns it", () => {
    expect(
      notificationsCursorSchema.safeParse({
        createdAt: "2026-11-26T09:15:02.123456+00:00",
        id,
      }).success,
    ).toBe(true);
  });

  it("accepts a Z timestamp too", () => {
    expect(
      notificationsCursorSchema.safeParse({
        createdAt: "2026-11-26T09:15:02Z",
        id,
      }).success,
    ).toBe(true);
  });

  it("refuses a missing half, a bad id, or a non-date", () => {
    expect(notificationsCursorSchema.safeParse({ id }).success).toBe(false);
    expect(
      notificationsCursorSchema.safeParse({
        createdAt: "2026-11-26T09:15:02Z",
        id: "nope",
      }).success,
    ).toBe(false);
    expect(
      notificationsCursorSchema.safeParse({ createdAt: "yesterday", id })
        .success,
    ).toBe(false);
  });
});
