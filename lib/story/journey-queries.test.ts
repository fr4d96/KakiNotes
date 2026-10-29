import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mockCallUntypedRpc = vi.fn();
vi.mock("@/lib/supabase/call-untyped-rpc", () => ({
  callUntypedRpc: (...args: unknown[]) => mockCallUntypedRpc(...args),
}));
vi.mock("@/lib/supabase/public", () => ({ createPublicClient: () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));

import {
  getPublishedStoryStopsDeduped,
  getRevisionStops,
} from "./journey-queries";

describe("journey queries", () => {
  beforeEach(() => {
    mockCallUntypedRpc.mockReset();
  });

  it("parses and orders the rows the RPC returns", async () => {
    mockCallUntypedRpc.mockResolvedValue([
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
    ]);
    const stops = await getRevisionStops("rev");
    expect(mockCallUntypedRpc).toHaveBeenCalledWith(
      expect.anything(),
      "get_revision_stops",
      { p_revision_id: "rev" },
    );
    expect(stops.map((s) => s.label)).toEqual(["A", "B"]);
  });

  it("asks for the PUBLISHED stops by slug only", async () => {
    mockCallUntypedRpc.mockResolvedValue([]);
    await getPublishedStoryStopsDeduped("some-slug");
    expect(mockCallUntypedRpc).toHaveBeenCalledWith(
      expect.anything(),
      "get_published_story_stops",
      { p_slug: "some-slug" },
    );
  });

  it("fails soft when the RPC is missing or errors, so the story still renders", async () => {
    mockCallUntypedRpc.mockImplementation(async () => {
      throw new Error("PGRST202");
    });
    await expect(getRevisionStops("rev")).resolves.toEqual([]);
    await expect(getPublishedStoryStopsDeduped("other-slug")).resolves.toEqual(
      [],
    );
  });
});
