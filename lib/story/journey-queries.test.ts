import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mockRpc = vi.fn();
const client = { rpc: (...args: unknown[]) => mockRpc(...args) };
vi.mock("@/lib/supabase/public", () => ({ createPublicClient: () => client }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client }));

import {
  getPublishedStoryStopsDeduped,
  getRevisionStops,
} from "./journey-queries";

describe("journey queries", () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it("parses and orders the rows the RPC returns", async () => {
    mockRpc.mockResolvedValue({
      error: null,
      data: [
        {
          sort_order: 1,
          latitude: "-41.29",
          longitude: "174.78",
          label: "B",
          section_anchor: null,
        },
        {
          sort_order: 0,
          latitude: "-36.85",
          longitude: "174.76",
          label: "A",
          section_anchor: "x",
        },
      ],
    });
    const stops = await getRevisionStops("rev");
    expect(mockRpc).toHaveBeenCalledWith("get_revision_stops", {
      p_revision_id: "rev",
    });
    expect(stops.map((s) => s.label)).toEqual(["A", "B"]);
  });

  it("asks for the PUBLISHED stops by slug only", async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    await getPublishedStoryStopsDeduped("some-slug");
    expect(mockRpc).toHaveBeenCalledWith("get_published_story_stops", {
      p_slug: "some-slug",
    });
  });

  it("fails soft when the RPC is missing or errors, so the story still renders", async () => {
    // A PostgREST error result...
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202" } });
    await expect(getRevisionStops("rev")).resolves.toEqual([]);
    // ...and a thrown network failure both fall back to no stops.
    mockRpc.mockImplementation(async () => {
      throw new Error("network");
    });
    await expect(getPublishedStoryStopsDeduped("other-slug")).resolves.toEqual(
      [],
    );
  });
});
