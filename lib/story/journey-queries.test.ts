import { beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";

vi.mock("server-only", () => ({}));

const mockRpc = vi.fn();
const client = { rpc: (...args: unknown[]) => mockRpc(...args) };
vi.mock("@/lib/supabase/public", () => ({ createPublicClient: () => client }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client }));

import {
  getMyJourney,
  getPublishedContributorJourney,
  getPublishedContributorJourneyStops,
} from "./journey-queries";

const CONTRIBUTOR = "11111111-1111-4111-8111-111111111111";

describe("journey queries", () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it("asks for the PUBLISHED journey by contributor id only, and parses rows", async () => {
    mockRpc.mockResolvedValue({
      error: null,
      data: [
        {
          story_id: "s1",
          slug: "a",
          title: "A",
          excerpt: null,
          parent_story_id: null,
          journey_label: "Auckland",
          journey_latitude: "-36.85",
          journey_longitude: "174.76",
          trip_start_date: "2025-01-01",
        },
        { story_id: "bad" },
      ],
    });
    const rows = await getPublishedContributorJourney(CONTRIBUTOR);
    expect(mockRpc).toHaveBeenCalledWith("get_published_contributor_journey", {
      p_contributor_id: CONTRIBUTOR,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].journey_latitude).toBe(-36.85);
  });

  it("returns the map's stop list", async () => {
    mockRpc.mockResolvedValue({
      error: null,
      data: [
        {
          story_id: "s1",
          slug: "a",
          title: "A",
          journey_label: "Auckland",
          journey_latitude: -36.85,
          journey_longitude: 174.76,
        },
      ],
    });
    const stops = await getPublishedContributorJourneyStops(
      "22222222-2222-4222-8222-222222222222",
    );
    expect(stops).toEqual([
      {
        latitude: -36.85,
        longitude: 174.76,
        label: "Auckland",
        storyTitle: "A",
        href: "/stories/a",
        parentIndex: null,
      },
    ]);
  });

  it("fails soft: an RPC error or a throw gives []", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "nope" } });
    expect(
      await getPublishedContributorJourney(
        "33333333-3333-4333-8333-333333333333",
      ),
    ).toEqual([]);
    mockRpc.mockRejectedValue(new Error("boom"));
    expect(
      await getPublishedContributorJourney(
        "44444444-4444-4444-8444-444444444444",
      ),
    ).toEqual([]);
  });

  it("getMyJourney maps rows, coerces numerics and drops malformed ones", async () => {
    mockRpc.mockResolvedValue({
      error: null,
      data: [
        {
          id: "s1",
          slug: "a",
          title: "A",
          lifecycle_status: "published",
          pinnable: true,
          is_new_zealand: true,
          parent_story_id: null,
          journey_label: "Auckland",
          journey_latitude: "-36.85",
          journey_longitude: "174.76",
          trip_start_date: null,
        },
        {
          id: "s2",
          slug: "b",
          title: null,
          lifecycle_status: "draft",
          pinnable: false,
          is_new_zealand: true,
          parent_story_id: "s1",
          journey_label: null,
          journey_latitude: null,
          journey_longitude: null,
          trip_start_date: null,
        },
        { id: 5 },
      ],
    });
    const mine = await getMyJourney();
    expect(mine).toHaveLength(2);
    expect(mine[0].place).toEqual({
      label: "Auckland",
      latitude: -36.85,
      longitude: 174.76,
    });
    expect(mine[1].place).toBeNull();
    expect(mine[1].parentStoryId).toBe("s1");
  });

  it("getMyJourney throws when the RPC errors", async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error("x") });
    await expect(getMyJourney()).rejects.toThrow();
  });
});
