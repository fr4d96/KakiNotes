// @vitest-environment node
//
// Country-scoping tests for lib/story/public-queries.ts (the China section,
// 2026-10-14): every reader that must never mix NZ and China rows passes
// p_country_slug through to the RPC, and the lookup-table readers resolve a
// country slug to id before filtering rather than silently returning
// everything on an unknown slug. See server-only mock rationale in
// public-queries.test.ts, alongside this file.
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type RpcCall = { fn: string; args: Record<string, unknown> };
const rpcCalls: RpcCall[] = [];

// A minimal fake PostgREST-ish client: .rpc() records the call and resolves
// with configurable data, and .from().select()... supports the handful of
// chained filters listPublicRegions/getPublicCountryId actually use.
function makeClient(options: {
  rpcData?: unknown;
  countryRow?: { id: string } | null;
}) {
  return {
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return Promise.resolve({ data: options.rpcData ?? [], error: null });
    },
    from: (table: string) => {
      if (table === "countries") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: options.countryRow ?? null,
                    error: null,
                  }),
              }),
            }),
          }),
        };
      }
      if (table === "regions") {
        return {
          select: () => ({
            eq: (col: string, value: unknown) => {
              const filters: Record<string, unknown> = { [col]: value };
              const builder = {
                eq: (col2: string, value2: unknown) => {
                  filters[col2] = value2;
                  return builder;
                },
                order: () =>
                  Promise.resolve({
                    data: filters.country_id ? [{ id: "scoped-region" }] : [],
                    error: null,
                  }),
              };
              return builder;
            },
          }),
        };
      }
      throw new Error(`unexpected table in test fake: ${table}`);
    },
  };
}

vi.mock("@/lib/supabase/public", () => ({
  createPublicClient: () => currentClient,
}));

let currentClient: ReturnType<typeof makeClient>;

const {
  getPublishedStoryBySlug,
  listPublishedStories,
  listPublicRegions,
  getPublicCountryId,
} = await import("@/lib/story/public-queries");

describe("country-scoped public readers", () => {
  it("getPublishedStoryBySlug passes p_country_slug through to get_published_story", async () => {
    currentClient = makeClient({ rpcData: [] });
    await getPublishedStoryBySlug("some-slug", "china");
    expect(rpcCalls.at(-1)).toEqual({
      fn: "get_published_story",
      args: { p_slug: "some-slug", p_country_slug: "china" },
    });
  });

  it("getPublishedStoryBySlug omits p_country_slug when not given (no filter)", async () => {
    currentClient = makeClient({ rpcData: [] });
    await getPublishedStoryBySlug("some-slug");
    expect(rpcCalls.at(-1)).toEqual({
      fn: "get_published_story",
      args: { p_slug: "some-slug" },
    });
  });

  it("listPublishedStories passes countrySlug through as p_country_slug", async () => {
    currentClient = makeClient({ rpcData: [] });
    await listPublishedStories({ countrySlug: "china", limit: 5 });
    const call = rpcCalls.at(-1)!;
    expect(call.fn).toBe("list_published_stories");
    expect(call.args.p_country_slug).toBe("china");
  });

  it("getPublicCountryId resolves a known, active country slug", async () => {
    currentClient = makeClient({ countryRow: { id: "china-id" } });
    await expect(getPublicCountryId("china")).resolves.toBe("china-id");
  });

  it("getPublicCountryId returns null for an unknown slug, never throws", async () => {
    currentClient = makeClient({ countryRow: null });
    await expect(getPublicCountryId("atlantis")).resolves.toBeNull();
  });

  it("listPublicRegions scopes to the resolved country id, not every region", async () => {
    currentClient = makeClient({ countryRow: { id: "china-id" } });
    const regions = await listPublicRegions("china");
    expect(regions).toEqual([{ id: "scoped-region" }]);
  });

  it("listPublicRegions returns an empty list for an unknown country slug, never widens to 'every region'", async () => {
    currentClient = makeClient({ countryRow: null });
    const regions = await listPublicRegions("atlantis");
    expect(regions).toEqual([]);
  });
});
