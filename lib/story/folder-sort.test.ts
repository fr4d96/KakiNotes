import { describe, expect, it } from "vitest";
import { sortByLastUpdated } from "./folder-sort";

const story = (title: string | null, updatedAt?: string | null) => ({
  title,
  updatedAt,
});

describe("sortByLastUpdated", () => {
  it("puts the most recently updated story first", () => {
    const sorted = sortByLastUpdated(
      [
        story("Auckland", "2026-11-01T00:00:00Z"),
        story("Napier", "2026-11-18T09:00:00Z"),
        story("Hamilton", "2026-11-10T00:00:00Z"),
      ],
      "en",
    );
    expect(sorted.map((s) => s.title)).toEqual([
      "Napier",
      "Hamilton",
      "Auckland",
    ]);
  });

  it("breaks ties by title, untitled last", () => {
    const same = "2026-11-10T00:00:00Z";
    const sorted = sortByLastUpdated(
      [story(null, same), story("Wanaka", same), story("Gisborne", same)],
      "en",
    );
    expect(sorted.map((s) => s.title)).toEqual(["Gisborne", "Wanaka", null]);
  });

  it("puts stories with no update time last, A-Z among themselves", () => {
    const sorted = sortByLastUpdated(
      [
        story("Zeta"),
        story("Old", "2020-01-01T00:00:00Z"),
        story("Alpha", null),
      ],
      "en",
    );
    expect(sorted.map((s) => s.title)).toEqual(["Old", "Alpha", "Zeta"]);
  });

  it("never mutates its input", () => {
    const input = [story("B", "2026-01-01"), story("A", "2026-02-01")];
    sortByLastUpdated(input, "en");
    expect(input.map((s) => s.title)).toEqual(["B", "A"]);
  });
});
