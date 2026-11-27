import { describe, expect, it } from "vitest";
import {
  combineFamilyExpenses,
  storyTotal,
  type FamilyExpenseStory,
} from "./family-expenses";

function story(over: Partial<FamilyExpenseStory>): FamilyExpenseStory {
  return {
    title: "Story",
    slug: "story",
    totalCents: null,
    tripStartDate: null,
    tripEndDate: null,
    expenses: [],
    currency: "NZD",
    ...over,
  };
}

const main = story({
  title: "Main",
  slug: "main",
  totalCents: 500_000,
  tripStartDate: "2026-02-01",
  tripEndDate: "2026-06-30",
  expenses: [
    { name: "Rent", amount_nzd_cents: 300_000, note: null },
    { name: "Food", amount_nzd_cents: 200_000, note: null },
  ],
});

describe("storyTotal", () => {
  it("prefers the stated total", () => {
    expect(storyTotal(main)).toBe(500_000);
  });

  it("falls back to the breakdown's sum, ignoring zero rows", () => {
    expect(
      storyTotal(
        story({
          expenses: [
            { name: "Rent", amount_nzd_cents: 1_000, note: null },
            { name: "Bond", amount_nzd_cents: 0, note: null },
          ],
        }),
      ),
    ).toBe(1_000);
  });

  it("is null when nothing was recorded", () => {
    expect(storyTotal(story({}))).toBeNull();
  });
});

describe("combineFamilyExpenses", () => {
  it("is null when no sub story recorded any money", () => {
    expect(combineFamilyExpenses(main, [story({ slug: "a" })])).toBeNull();
    expect(combineFamilyExpenses(main, [])).toBeNull();
  });

  it("adds totals and merges categories by name", () => {
    const combined = combineFamilyExpenses(main, [
      story({
        title: "Kiwi picking",
        slug: "kiwi",
        totalCents: 150_000,
        tripStartDate: "2026-01-15",
        tripEndDate: "2026-03-01",
        expenses: [
          { name: "Rent", amount_nzd_cents: 100_000, note: null },
          { name: "Other", amount_nzd_cents: 50_000, note: "Gumboots" },
        ],
      }),
    ]);
    expect(combined).not.toBeNull();
    expect(combined!.totalCents).toBe(650_000);
    expect(combined!.expenses).toEqual([
      { name: "Rent", amount_nzd_cents: 400_000, note: null },
      { name: "Food", amount_nzd_cents: 200_000, note: null },
      { name: "Other", amount_nzd_cents: 50_000, note: "Gumboots" },
    ]);
    // Earliest start, latest end across the family.
    expect(combined!.tripStartDate).toBe("2026-01-15");
    expect(combined!.tripEndDate).toBe("2026-06-30");
    expect(combined!.perStory).toEqual([
      { title: "Main", slug: "main", totalCents: 500_000, isMain: true },
      {
        title: "Kiwi picking",
        slug: "kiwi",
        totalCents: 150_000,
        isMain: false,
      },
    ]);
    expect(combined!.skippedOtherCurrency).toBe(0);
  });

  it("never adds a different currency, and counts what it left out", () => {
    const combined = combineFamilyExpenses(main, [
      story({ slug: "nz", totalCents: 10_000 }),
      story({ slug: "cn", totalCents: 99_999, currency: "CNY" }),
    ]);
    expect(combined!.totalCents).toBe(510_000);
    expect(combined!.perStory.map((s) => s.slug)).toEqual(["main", "nz"]);
    expect(combined!.skippedOtherCurrency).toBe(1);
  });

  it("is null when the only costly sub stories are in another currency", () => {
    expect(
      combineFamilyExpenses(main, [
        story({ slug: "cn", totalCents: 1, currency: "CNY" }),
      ]),
    ).toBeNull();
  });

  it("leaves a main story with no costs of its own out of the per-story list", () => {
    const combined = combineFamilyExpenses(story({ slug: "main" }), [
      story({ slug: "a", title: "A", totalCents: 2_000 }),
    ]);
    expect(combined!.totalCents).toBe(2_000);
    expect(combined!.perStory).toEqual([
      { title: "A", slug: "a", totalCents: 2_000, isMain: false },
    ]);
  });

  it("does not mutate the input rows when merging", () => {
    const sub = story({
      slug: "a",
      totalCents: 1,
      expenses: [{ name: "Rent", amount_nzd_cents: 1, note: null }],
    });
    combineFamilyExpenses(main, [sub]);
    expect(main.expenses[0].amount_nzd_cents).toBe(300_000);
  });
});
