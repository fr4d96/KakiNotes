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
const mockReorderStoryMedia = vi.fn();
const mockSetStoryCoverMedia = vi.fn();
const mockDetachStoryMedia = vi.fn();
vi.mock("@/lib/story/mutations", () => ({
  saveRevisionDraft: (...args: unknown[]) => mockSaveRevisionDraft(...args),
  setRevisionLocations: vi.fn(),
  setRevisionTags: vi.fn(),
  setRevisionExpenses: vi.fn(),
  updateStoryMediaCaption: vi.fn(),
  reorderStoryMedia: (...args: unknown[]) => mockReorderStoryMedia(...args),
  setStoryCoverMedia: (...args: unknown[]) => mockSetStoryCoverMedia(...args),
  detachStoryMedia: (...args: unknown[]) => mockDetachStoryMedia(...args),
  cancelPendingStoryMediaUpload: vi.fn(),
}));

import {
  saveRevisionFieldsAction,
  reorderMediaAction,
  setCoverAction,
  detachMediaAction,
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
