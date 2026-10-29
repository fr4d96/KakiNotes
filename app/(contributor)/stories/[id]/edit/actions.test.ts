import { describe, expect, it, vi, beforeEach } from "vitest";

// Follows upload-actions.test.ts's established pattern: mock every
// side-effecting dependency at the module boundary and test the ACTIONS'
// own decision logic as a pure unit, never against a live Supabase instance
// or real Drive calls.
//
// Review-driven rework: save_revision_draft / reorder_story_media /
// set_story_cover_media / detach_story_media are shared editor RPCs used by
// other in-flight branches against this dev database, and by the deployed
// app in production -- their signatures/return shapes must NEVER change.
// These tests assert exactly that: each underlying mutation wrapper
// (lib/story/mutations.ts) is called with the SAME arguments main uses, its
// return is used unchanged, and the only Drive-related work happens inside
// next/server's after() via a SEPARATE, new, cheap lookup
// (getDriveSyncGate) -- never by reading anything off the mutation's own
// return value.
vi.mock("server-only", () => ({}));

const mockGetCurrentUser = vi.fn();
vi.mock("@/lib/auth/get-current-user", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

// next/server's after() runs its callback asynchronously, outside the
// request lifecycle it's actually meant for in this test harness -- here
// it's captured so a test can assert whether it was scheduled at all (and
// run it manually to check what it does) without needing a real
// request/response cycle for it to fire against.
const afterCalls: Array<() => unknown> = [];
vi.mock("next/server", () => ({
  after: (cb: () => unknown) => {
    afterCalls.push(cb);
  },
}));

const mockGetDriveSyncGate = vi.fn();
const mockSyncStoryFolder = vi.fn();
const mockRenameStoryFolderIfExists = vi.fn();
vi.mock("@/lib/story/drive-folders", () => ({
  getDriveSyncGate: (...args: unknown[]) => mockGetDriveSyncGate(...args),
  syncStoryFolder: (...args: unknown[]) => mockSyncStoryFolder(...args),
  renameStoryFolderIfExists: (...args: unknown[]) =>
    mockRenameStoryFolderIfExists(...args),
}));

const mockSaveRevisionDraft = vi.fn();
const mockSetRevisionStops = vi.fn();
const mockReorderStoryMedia = vi.fn();
const mockSetStoryCoverMedia = vi.fn();
const mockDetachStoryMedia = vi.fn();
const mockSetStoryCountry = vi.fn();
vi.mock("@/lib/story/mutations", () => ({
  saveRevisionDraft: (...args: unknown[]) => mockSaveRevisionDraft(...args),
  setRevisionLocations: vi.fn(),
  setRevisionTags: vi.fn(),
  setRevisionExpenses: vi.fn(),
  setRevisionStops: (...args: unknown[]) => mockSetRevisionStops(...args),
  updateStoryMediaCaption: vi.fn(),
  reorderStoryMedia: (...args: unknown[]) => mockReorderStoryMedia(...args),
  setStoryCoverMedia: (...args: unknown[]) => mockSetStoryCoverMedia(...args),
  detachStoryMedia: (...args: unknown[]) => mockDetachStoryMedia(...args),
  cancelPendingStoryMediaUpload: vi.fn(),
  setStoryCountry: (...args: unknown[]) => mockSetStoryCountry(...args),
}));

import {
  saveRevisionFieldsAction,
  reorderMediaAction,
  setCoverAction,
  detachMediaAction,
  setJourneyStopsAction,
  resolveGoogleMapsLinkAction,
  setCountryAction,
} from "./actions";

const user = { id: "11111111-1111-4111-8111-111111111111" };
const revisionId = "22222222-2222-4222-8222-222222222222";
const storyId = "33333333-3333-4333-8333-333333333333";
const mediaId = "44444444-4444-4444-8444-444444444444";

const minimalRevisionInput = {
  title: "My Trip",
  contentJson: [{ type: "markdown" as const, text: "hello" }],
};

beforeEach(() => {
  afterCalls.length = 0;
  mockGetCurrentUser.mockReset();
  mockGetCurrentUser.mockResolvedValue(user);
  mockGetDriveSyncGate.mockReset();
  mockSyncStoryFolder.mockReset();
  mockRenameStoryFolderIfExists.mockReset();
  mockSaveRevisionDraft.mockReset();
  mockReorderStoryMedia.mockReset();
  mockSetStoryCoverMedia.mockReset();
  mockDetachStoryMedia.mockReset();
  mockSetStoryCountry.mockReset();
});

async function runScheduled() {
  // after() callbacks are async; run them all to completion.
  await Promise.all(afterCalls.map((cb) => cb()));
}

describe("saveRevisionFieldsAction -- shared RPC untouched, Drive hook via after()", () => {
  it("calls saveRevisionDraft with exactly main's arguments and uses its return unchanged", async () => {
    mockSaveRevisionDraft.mockResolvedValue(7);

    const result = await saveRevisionFieldsAction(
      revisionId,
      1,
      minimalRevisionInput,
      storyId,
    );

    expect(mockSaveRevisionDraft).toHaveBeenCalledWith(
      revisionId,
      1,
      minimalRevisionInput,
    );
    expect(result).toEqual({ ok: true, version: 7 });
  });

  it("schedules the gate lookup via after(), never inline", async () => {
    mockSaveRevisionDraft.mockResolvedValue(7);

    await saveRevisionFieldsAction(
      revisionId,
      1,
      minimalRevisionInput,
      storyId,
    );

    expect(afterCalls).toHaveLength(1);
    expect(mockGetDriveSyncGate).not.toHaveBeenCalled();
  });

  it("renames only when the gate says a folder already exists", async () => {
    mockSaveRevisionDraft.mockResolvedValue(7);
    mockGetDriveSyncGate.mockResolvedValue({
      hasDriveMedia: false,
      hasFolder: true,
    });

    await saveRevisionFieldsAction(
      revisionId,
      1,
      minimalRevisionInput,
      storyId,
    );
    await runScheduled();

    expect(mockGetDriveSyncGate).toHaveBeenCalledWith(storyId);
    expect(mockRenameStoryFolderIfExists).toHaveBeenCalledWith(
      user.id,
      storyId,
    );
  });

  it("never attempts a rename when the gate says no folder exists", async () => {
    mockSaveRevisionDraft.mockResolvedValue(7);
    mockGetDriveSyncGate.mockResolvedValue({
      hasDriveMedia: false,
      hasFolder: false,
    });

    await saveRevisionFieldsAction(
      revisionId,
      1,
      minimalRevisionInput,
      storyId,
    );
    await runScheduled();

    expect(mockRenameStoryFolderIfExists).not.toHaveBeenCalled();
  });

  it("never attempts a rename when the gate itself returns null (non-Drive story)", async () => {
    mockSaveRevisionDraft.mockResolvedValue(7);
    mockGetDriveSyncGate.mockResolvedValue(null);

    await saveRevisionFieldsAction(
      revisionId,
      1,
      minimalRevisionInput,
      storyId,
    );
    await runScheduled();

    expect(mockRenameStoryFolderIfExists).not.toHaveBeenCalled();
  });

  it("schedules nothing at all when no storyId is given", async () => {
    mockSaveRevisionDraft.mockResolvedValue(7);

    await saveRevisionFieldsAction(revisionId, 1, minimalRevisionInput);

    expect(afterCalls).toHaveLength(0);
  });
});

describe("reorderMediaAction / setCoverAction / detachMediaAction -- shared RPCs untouched, Drive sync via after()", () => {
  it("reorderMediaAction calls reorder_story_media with main's exact arguments", async () => {
    mockReorderStoryMedia.mockResolvedValue(undefined);

    const result = await reorderMediaAction(revisionId, 1, [mediaId], storyId);

    expect(mockReorderStoryMedia).toHaveBeenCalledWith(revisionId, 1, [
      mediaId,
    ]);
    expect(result).toEqual({ ok: true });
  });

  it("a non-Drive story (gate returns null) triggers the gate lookup but no sync", async () => {
    mockReorderStoryMedia.mockResolvedValue(undefined);
    mockGetDriveSyncGate.mockResolvedValue(null);

    await reorderMediaAction(revisionId, 1, [mediaId], storyId);
    await runScheduled();

    expect(mockGetDriveSyncGate).toHaveBeenCalledWith(storyId);
    expect(mockSyncStoryFolder).not.toHaveBeenCalled();
  });

  it("a Drive story (gate says hasDriveMedia) triggers a best-effort sync", async () => {
    mockReorderStoryMedia.mockResolvedValue(undefined);
    mockGetDriveSyncGate.mockResolvedValue({
      hasDriveMedia: true,
      hasFolder: true,
    });

    await reorderMediaAction(revisionId, 1, [mediaId], storyId);
    await runScheduled();

    expect(mockSyncStoryFolder).toHaveBeenCalledWith(user.id, storyId);
  });

  it("setCoverAction: calls set_story_cover_media unchanged and only syncs when hasDriveMedia", async () => {
    mockSetStoryCoverMedia.mockResolvedValue(undefined);
    mockGetDriveSyncGate.mockResolvedValue({
      hasDriveMedia: false,
      hasFolder: true,
    });

    const result = await setCoverAction(revisionId, 1, mediaId, storyId);
    await runScheduled();

    expect(mockSetStoryCoverMedia).toHaveBeenCalledWith(revisionId, 1, mediaId);
    expect(result).toEqual({ ok: true });
    expect(mockSyncStoryFolder).not.toHaveBeenCalled();
  });

  it("detachMediaAction: calls detach_story_media unchanged and syncs when hasDriveMedia", async () => {
    mockDetachStoryMedia.mockResolvedValue(undefined);
    mockGetDriveSyncGate.mockResolvedValue({
      hasDriveMedia: true,
      hasFolder: true,
    });

    const result = await detachMediaAction(revisionId, 1, mediaId, storyId);
    await runScheduled();

    expect(mockDetachStoryMedia).toHaveBeenCalledWith(revisionId, 1, mediaId);
    expect(result).toEqual({ ok: true });
    expect(mockSyncStoryFolder).toHaveBeenCalledWith(user.id, storyId);
  });

  it("schedules nothing at all when no storyId is given, for any of the three actions", async () => {
    mockReorderStoryMedia.mockResolvedValue(undefined);
    mockSetStoryCoverMedia.mockResolvedValue(undefined);
    mockDetachStoryMedia.mockResolvedValue(undefined);

    await reorderMediaAction(revisionId, 1, [mediaId]);
    await setCoverAction(revisionId, 1, mediaId);
    await detachMediaAction(revisionId, 1, mediaId);

    expect(afterCalls).toHaveLength(0);
    expect(mockGetDriveSyncGate).not.toHaveBeenCalled();
  });
});

describe("setJourneyStopsAction", () => {
  const stop = {
    latitude: -45.0312,
    longitude: 169.1999,
    label: " Near Cromwell ",
  };

  beforeEach(() => {
    mockSetRevisionStops.mockReset();
    mockGetCurrentUser.mockReset();
  });

  it("refuses a signed-out caller without touching the RPC", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const result = await setJourneyStopsAction(revisionId, 3, [stop]);
    expect(result.ok).toBe(false);
    expect(mockSetRevisionStops).not.toHaveBeenCalled();
  });

  it("sends validated, trimmed, rounded stops and the revision id as given", async () => {
    mockGetCurrentUser.mockResolvedValue(user);
    mockSetRevisionStops.mockResolvedValue(undefined);
    const result = await setJourneyStopsAction(revisionId, 3, [stop]);
    expect(result).toEqual({ ok: true });
    expect(mockSetRevisionStops).toHaveBeenCalledWith(revisionId, 3, [
      { latitude: -45.03, longitude: 169.2, label: "Near Cromwell" },
    ]);
  });

  it("rejects coordinates outside New Zealand before calling the RPC", async () => {
    mockGetCurrentUser.mockResolvedValue(user);
    const result = await setJourneyStopsAction(revisionId, 3, [
      { ...stop, latitude: -33.8 },
    ]);
    expect(result.ok).toBe(false);
    expect(mockSetRevisionStops).not.toHaveBeenCalled();
  });

  it("rejects a blank label and more than 12 stops", async () => {
    mockGetCurrentUser.mockResolvedValue(user);
    expect(
      (await setJourneyStopsAction(revisionId, 3, [{ ...stop, label: " " }]))
        .ok,
    ).toBe(false);
    expect(
      (await setJourneyStopsAction(revisionId, 3, Array(13).fill(stop))).ok,
    ).toBe(false);
    expect(mockSetRevisionStops).not.toHaveBeenCalled();
  });

  it("returns the RPC's failure as a result instead of throwing", async () => {
    mockGetCurrentUser.mockResolvedValue(user);
    mockSetRevisionStops.mockRejectedValue(
      new Error("Stale version for story x"),
    );
    const result = await setJourneyStopsAction(revisionId, 3, [stop]);
    expect(result.ok).toBe(false);
  });
});

describe("resolveGoogleMapsLinkAction", () => {
  const fullLink =
    "https://www.google.com/maps/place/Taupo/@-38.68,176.07,12z/data=!8m2!3d-38.6857!4d176.0702";

  beforeEach(() => {
    mockGetCurrentUser.mockReset();
  });

  it("refuses a signed-out caller without any outbound request", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const fetchFn = vi.fn();
    vi.stubGlobal("fetch", fetchFn);
    expect(
      await resolveGoogleMapsLinkAction("https://maps.app.goo.gl/a"),
    ).toEqual({ ok: false, reason: "unauthenticated" });
    expect(fetchFn).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("rejects non-strings and over-long input", async () => {
    mockGetCurrentUser.mockResolvedValue(user);
    expect(await resolveGoogleMapsLinkAction(42)).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(
      await resolveGoogleMapsLinkAction(
        "https://goo.gl/maps/" + "a".repeat(2100),
      ),
    ).toEqual({ ok: false, reason: "invalid" });
  });

  it("resolves a full link for a signed-in user", async () => {
    mockGetCurrentUser.mockResolvedValue(user);
    expect(await resolveGoogleMapsLinkAction(fullLink)).toEqual({
      ok: true,
      latitude: -38.6857,
      longitude: 176.0702,
      placeName: "Taupo",
    });
  });
});

describe("setCountryAction", () => {
  it("validates the country slug and calls set_story_country unchanged", async () => {
    mockSetStoryCountry.mockResolvedValue(undefined);

    const result = await setCountryAction(storyId, "china");

    expect(mockSetStoryCountry).toHaveBeenCalledWith(storyId, "china");
    expect(result).toEqual({ ok: true });
  });

  it("rejects an unknown country slug before ever calling the RPC wrapper", async () => {
    const result = await setCountryAction(storyId, "australia");

    expect(result.ok).toBe(false);
    expect(mockSetStoryCountry).not.toHaveBeenCalled();
  });

  it("rejects a malformed storyId before ever calling the RPC wrapper", async () => {
    const result = await setCountryAction("not-a-uuid", "china");

    expect(result.ok).toBe(false);
    expect(mockSetStoryCountry).not.toHaveBeenCalled();
  });

  it("surfaces the RPC's own refusal (e.g. published, or locked after publication)", async () => {
    mockSetStoryCountry.mockRejectedValue(
      new Error("Country can't be changed after a story is published"),
    );

    const result = await setCountryAction(storyId, "china");

    expect(result.ok).toBe(false);
  });

  it("requires a signed-in caller", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const result = await setCountryAction(storyId, "china");

    expect(result.ok).toBe(false);
    expect(mockSetStoryCountry).not.toHaveBeenCalled();
  });
});
