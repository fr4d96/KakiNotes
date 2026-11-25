import { beforeEach, describe, expect, it, vi } from "vitest";

// Same boundary-mocking shape as ./[id]/actions.test.ts. The real
// approve-revision, bulk-approve and publish-orchestration code runs here;
// only the database, storage and cache calls are stubbed.

vi.mock("server-only", () => ({}));
const mockRevalidatePath = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => mockRevalidatePath(path),
}));

const mockGetCurrentUserRole = vi.fn();
vi.mock("@/lib/auth/roles", async () => {
  const { resolveStaffAccess } = await vi.importActual<
    typeof import("@/lib/auth/staff-guard")
  >("@/lib/auth/staff-guard");
  return {
    resolveStaffAccess,
    getCurrentUserRole: () => mockGetCurrentUserRole(),
  };
});
vi.mock("@/lib/auth/get-current-user", () => ({
  getCurrentUser: async () => ({ id: "moderator" }),
}));

const mockDetail = vi.fn();
const mockBegin = vi.fn();
const mockFinalize = vi.fn();
vi.mock("@/lib/story/moderation", () => ({
  getStoryForModerator: (id: string) => mockDetail(id),
  beginStoryPublicationAttempt: (id: string) => mockBegin(id),
  finalizeStoryPublication: (params: unknown) => mockFinalize(params),
  parseModeratorMedia: (media: unknown) => media ?? [],
}));
const mockCopy = vi.fn();
vi.mock("@/lib/story/image-pipeline", () => ({
  copyStoryMediaToPublic: (id: string, attempt: string) =>
    mockCopy(id, attempt),
}));
// Pages refreshed per story; photo cache emptied for one story (replacement)
// or once for the whole request.
const mockInvalidate = vi.fn();
const mockPurgeForStory = vi.fn();
const mockPurgeOnce = vi.fn();
vi.mock("@/lib/story/public-cache", () => ({
  invalidateStoryPagesOnly: (slug: string) => mockInvalidate(slug),
  invalidateStoryPublicCache: (slug: string) => mockPurgeForStory(slug),
  invalidateStoryListingsPublicCache: () => mockPurgeOnce(),
}));
const mockLog = vi.fn();
vi.mock("@/lib/log", () => ({ logStaffAction: (e: unknown) => mockLog(e) }));

import { approveStoriesAction } from "./actions";

const id = (n: number) => `${String(n).repeat(8)}-1111-4111-8111-111111111111`;

function story(revisionId: string, overrides: Record<string, unknown> = {}) {
  return {
    story_id: `story-${revisionId}`,
    slug: `slug-${revisionId[0]}`,
    title: `Story ${revisionId[0]}`,
    lifecycle_status: "pending_review",
    revision_status: "submitted",
    consent_valid: true,
    content_json: [{ type: "paragraph", text: "A real story." }],
    media: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCurrentUserRole.mockResolvedValue("moderator");
  mockDetail.mockImplementation(async (revisionId: string) => [
    story(revisionId),
  ]);
  mockBegin.mockImplementation(
    async (revisionId: string) => `att-${revisionId}`,
  );
  mockFinalize.mockResolvedValue(undefined);
  mockCopy.mockResolvedValue(undefined);
});

async function run(ids: string[]) {
  const response = await approveStoriesAction(ids);
  if ("error" in response) throw new Error(response.error);
  return response.results;
}

describe("approveStoriesAction", () => {
  it.each(["user", "editor", null])("refuses role %s", async (role) => {
    mockGetCurrentUserRole.mockResolvedValue(role);
    expect(await approveStoriesAction([id(1)])).toEqual({
      error: expect.stringMatching(/moderator or admin/),
    });
    expect(mockBegin).not.toHaveBeenCalled();
  });

  it.each([
    ["nothing", []],
    ["a bad id", ["not-a-uuid"]],
    ["more than one request's worth", [1, 2, 3, 4, 5].map(id)],
  ])("refuses %s", async (_label, ids) => {
    expect(await approveStoriesAction(ids)).toHaveProperty("error");
    expect(mockBegin).not.toHaveBeenCalled();
  });

  it("publishes every story, in order, and refreshes each one's pages", async () => {
    const results = await run([id(1), id(2)]);
    expect(results).toEqual([
      { revisionId: id(1), title: "Story 1", ok: true },
      { revisionId: id(2), title: "Story 2", ok: true },
    ]);
    expect(mockFinalize.mock.calls.map((c) => c[0].revisionId)).toEqual([
      id(1),
      id(2),
    ]);
    expect(mockInvalidate.mock.calls.flat()).toEqual(["slug-1", "slug-2"]);
    expect(mockRevalidatePath).toHaveBeenCalledWith("/moderation/stories");
    expect(mockLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "moderation.bulk_approve",
        outcome: "success",
        target: id(2),
      }),
    );
  });

  it("carries on past a story that fails, and reports why", async () => {
    mockFinalize.mockImplementation(async ({ revisionId }) => {
      if (revisionId === id(1)) throw new Error("consent was withdrawn");
    });
    const results = await run([id(1), id(2)]);
    expect(results[0]).toMatchObject({ ok: false, title: "Story 1" });
    expect(results[0].error).toContain("consent was withdrawn");
    expect(results[1].ok).toBe(true);
    expect(mockInvalidate.mock.calls.flat()).toEqual(["slug-2"]);
  });

  it.each([
    ["empty", { content_json: [] }],
    ["without consent", { consent_valid: false }],
    ["already decided", { revision_status: "approved" }],
    [
      "holding an unprocessed photo",
      { media: [{ mediaId: "m", processingState: "failed" }] },
    ],
  ])(
    "never begins an attempt for a story that is %s",
    async (_label, overrides) => {
      mockDetail.mockImplementation(async (revisionId: string) => [
        story(revisionId, overrides),
      ]);
      expect((await run([id(1)]))[0].ok).toBe(false);
      expect(mockBegin).not.toHaveBeenCalled();
      expect(mockInvalidate).not.toHaveBeenCalled();
      expect(mockRevalidatePath).not.toHaveBeenCalled();
    },
  );

  it("publishes a repeated id once", async () => {
    expect(await run([id(1), id(1)])).toHaveLength(1);
    expect(mockBegin).toHaveBeenCalledTimes(1);
  });

  it("reports a revision it cannot load", async () => {
    mockDetail.mockRejectedValue(new Error("No such revision"));
    expect((await run([id(1)]))[0]).toMatchObject({
      ok: false,
      title: null,
      error: expect.stringContaining("No such revision"),
    });
  });

  it("empties the photo cache once, however many stories go live", async () => {
    await run([id(1), id(2), id(3), id(4)]);
    expect(mockInvalidate).toHaveBeenCalledTimes(4);
    expect(mockPurgeOnce).toHaveBeenCalledTimes(1);
    expect(mockPurgeForStory).not.toHaveBeenCalled();
  });

  it("empties it at once for a replacement, which may remove photos", async () => {
    mockDetail.mockImplementation(async (revisionId: string) => [
      story(revisionId, { lifecycle_status: "published" }),
    ]);
    await run([id(1), id(2)]);
    expect(mockPurgeForStory.mock.calls.flat()).toEqual(["slug-1", "slug-2"]);
    expect(mockPurgeOnce).not.toHaveBeenCalled();
  });

  it("does not empty it when nothing was published", async () => {
    mockFinalize.mockRejectedValue(new Error("no"));
    await run([id(1)]);
    expect(mockPurgeOnce).not.toHaveBeenCalled();
  });
});
