// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import {
  costBandsOffered,
  countryCurrency,
} from "@/lib/story/country-currency";

function countriesRow(row: Record<string, unknown> | null) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data: row, error: null })),
  };
  vi.mocked(createClient).mockResolvedValue({
    from: vi.fn(() => query),
  } as never);
}

describe("countryCurrency", () => {
  it("reads the country's currency code", async () => {
    countriesRow({ slug: "china", currency_code: "CNY" });
    expect(await countryCurrency("china")).toBe("CNY");
  });

  it("answers NZD before the migration adds the column, and for an unknown country", async () => {
    countriesRow({ slug: "china" });
    expect(await countryCurrency("china")).toBe("NZD");
    countriesRow(null);
    expect(await countryCurrency("atlantis")).toBe("NZD");
  });
});

describe("costBandsOffered", () => {
  it("offers bands only where they are labelled in that currency", () => {
    expect(costBandsOffered("NZD")).toBe(true);
    expect(costBandsOffered("MYR")).toBe(true);
    expect(costBandsOffered("CNY")).toBe(false);
  });
});
