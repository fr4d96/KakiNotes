// @vitest-environment node
import { createHash } from "node:crypto";
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const afterCalls: Array<() => unknown> = [];
vi.mock("next/server", () => ({
  after: (cb: () => unknown) => {
    afterCalls.push(cb);
  },
}));

let currentUser: { id: string } | null = { id: "user-1" };
vi.mock("@/lib/auth/get-current-user", () => ({
  getCurrentUser: async () => currentUser,
}));

// Every RPC goes through one mock; tests set per-name responses.
type RpcResult = { data: unknown; error: { message: string } | null };
const rpcResponses = new Map<string, RpcResult | (() => RpcResult)>();
const rpcMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: rpcMock }),
}));
function rpcCalls(name: string) {
  return rpcMock.mock.calls.filter(([n]) => n === name);
}

const driveErrors = vi.hoisted(() => {
  class DriveConnectionError extends Error {}
  class DriveApiError extends Error {
    constructor(
      message: string,
      public readonly status?: number,
    ) {
      super(message);
    }
  }
  return { DriveConnectionError, DriveApiError };
});
const getAccessToken = vi.hoisted(() => vi.fn(async () => "access-token"));
const uploadDerivativeFile = vi.hoisted(() =>
  vi.fn(async () => "new-drive-file"),
);
const downloadFileBytes = vi.hoisted(() => vi.fn());
const deleteFilePermanently = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/drive/drive-client", () => ({
  ...driveErrors,
  getAccessToken,
  uploadDerivativeFile,
  downloadFileBytes,
  deleteFilePermanently,
}));

const downloadProcessedDerivativeForMove = vi.hoisted(() => vi.fn());
const deleteMovedSupabaseCopies = vi.hoisted(() => vi.fn(async () => true));
vi.mock("@/lib/story/image-pipeline", () => ({
  downloadProcessedDerivativeForMove,
  deleteMovedSupabaseCopies,
}));

const ensureStoryFolder = vi.hoisted(() =>
  vi.fn(async () => "story-folder-id"),
);
const syncStoryFolder = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/story/drive-folders", () => ({
  ensureStoryFolder,
  syncStoryFolder,
  extensionForMimeType: (mimeType: string | null | undefined) =>
    mimeType === "image/png" ? "png" : "jpg",
}));

import {
  DriveMoveFatalError,
  beginDriveMoveRun,
  finishDriveMoveRun,
  moveNextPhotoToDrive,
} from "@/lib/story/media-move";

const BYTES = Buffer.from("processed-derivative-bytes");
const SHA = createHash("sha256").update(BYTES).digest("hex");
const RUN = "11111111-1111-4111-8111-111111111111";

function claimRow(overrides: Record<string, unknown> = {}) {
  return {
    job_id: "job-1",
    media_id: "media-1",
    story_id: "story-1",
    story_title: "Kiwi orchard summer",
    job_status: "pending",
    error_code: null,
    sha256: SHA,
    processed_mime_type: "image/jpeg",
    processed_file_size_bytes: BYTES.byteLength,
    stale_drive_file_ids: [],
    ...overrides,
  };
}

beforeEach(() => {
  afterCalls.length = 0;
  currentUser = { id: "user-1" };
  rpcResponses.clear();
  rpcMock.mockReset();
  rpcMock.mockImplementation(async (name: string) => {
    const response = rpcResponses.get(name);
    if (typeof response === "function") return response();
    return response ?? { data: null, error: null };
  });
  rpcResponses.set("claim_next_drive_move", {
    data: [claimRow()],
    error: null,
  });
  rpcResponses.set("list_story_drive_media_for_sync", {
    data: [{ media_id: "a" }, { media_id: "b" }],
    error: null,
  });
  rpcResponses.set("switch_story_media_to_drive", {
    data: [{ had_public_copy: false }],
    error: null,
  });

  getAccessToken.mockReset();
  getAccessToken.mockResolvedValue("access-token");
  uploadDerivativeFile.mockReset();
  uploadDerivativeFile.mockResolvedValue("new-drive-file");
  downloadFileBytes.mockReset();
  downloadFileBytes.mockResolvedValue(Buffer.from(BYTES));
  deleteFilePermanently.mockClear();
  downloadProcessedDerivativeForMove.mockReset();
  downloadProcessedDerivativeForMove.mockResolvedValue({
    bytes: BYTES,
    sha256: SHA,
    mimeType: "image/jpeg",
  });
  deleteMovedSupabaseCopies.mockClear();
  ensureStoryFolder.mockClear();
  syncStoryFolder.mockClear();
});

describe("moveNextPhotoToDrive", () => {
  it("copies, verifies, then flips -- in that order -- and deletes old copies of an unpublished photo at once", async () => {
    const step = await moveNextPhotoToDrive(RUN);

    expect(step).toEqual({
      done: false,
      outcome: "moved",
      hadPublicCopy: false,
    });
    expect(ensureStoryFolder).toHaveBeenCalledWith(
      expect.anything(),
      "access-token",
      "user-1",
      "story-1",
    );
    // Two photos already in the story's Drive folder -> this one is 03.
    expect(uploadDerivativeFile).toHaveBeenCalledWith(
      "access-token",
      "story-folder-id",
      "03.jpg",
      BYTES,
      "image/jpeg",
      "user-1",
    );
    expect(rpcCalls("record_drive_move_copied")[0][1]).toEqual({
      p_job_id: "job-1",
      p_drive_file_id: "new-drive-file",
      p_drive_folder_id: "story-folder-id",
    });
    expect(downloadFileBytes).toHaveBeenCalledWith(
      "access-token",
      "new-drive-file",
      "user-1",
    );
    expect(rpcCalls("switch_story_media_to_drive")[0][1]).toEqual({
      p_job_id: "job-1",
      p_sha256: SHA,
    });

    const order = rpcMock.mock.calls.map(([name]) => name);
    expect(order.indexOf("record_drive_move_copied")).toBeLessThan(
      order.indexOf("switch_story_media_to_drive"),
    );
    expect(deleteMovedSupabaseCopies).toHaveBeenCalledWith("job-1");
    expect(deleteFilePermanently).not.toHaveBeenCalled();
  });

  it("keeps the old copies of a published photo (deleted on a later run, after 5 minutes)", async () => {
    rpcResponses.set("switch_story_media_to_drive", {
      data: [{ had_public_copy: true }],
      error: null,
    });

    const step = await moveNextPhotoToDrive(RUN);

    expect(step).toEqual({
      done: false,
      outcome: "moved",
      hadPublicCopy: true,
    });
    expect(deleteMovedSupabaseCopies).not.toHaveBeenCalled();
  });

  it("never flips when Drive's stored bytes don't match, and removes the bad Drive copy", async () => {
    downloadFileBytes.mockResolvedValue(Buffer.from("something else"));

    const step = await moveNextPhotoToDrive(RUN);

    expect(step).toMatchObject({ outcome: "failed", reason: "verify_failed" });
    expect(rpcCalls("switch_story_media_to_drive")).toHaveLength(0);
    expect(deleteFilePermanently).toHaveBeenCalledWith(
      "access-token",
      "new-drive-file",
      "user-1",
    );
    expect(rpcCalls("record_drive_move_failed")[0][1]).toEqual({
      p_job_id: "job-1",
      p_error_code: "verify_failed",
    });
    expect(deleteMovedSupabaseCopies).not.toHaveBeenCalled();
  });

  it("reports a photo a moderator started publishing mid-move, and removes the Drive copy", async () => {
    rpcResponses.set("switch_story_media_to_drive", {
      data: null,
      error: { message: "media_not_movable" },
    });

    const step = await moveNextPhotoToDrive(RUN);

    expect(step).toMatchObject({
      outcome: "failed",
      reason: "being_published",
      storyTitle: "Kiwi orchard summer",
    });
    expect(deleteFilePermanently).toHaveBeenCalledWith(
      "access-token",
      "new-drive-file",
      "user-1",
    );
  });

  it("keeps the Drive file and leaves the job open when the flip's outcome is unknown", async () => {
    // e.g. the response was lost after the transaction committed: the Drive
    // file may already be the live copy, so deleting it could break a page.
    rpcResponses.set("switch_story_media_to_drive", {
      data: null,
      error: { message: "TypeError: fetch failed" },
    });

    const step = await moveNextPhotoToDrive(RUN);

    expect(step).toMatchObject({ outcome: "failed", reason: "unknown" });
    expect(deleteFilePermanently).not.toHaveBeenCalled();
    expect(rpcCalls("record_drive_move_failed")).toHaveLength(0);
  });

  it("deletes Drive files an earlier, crashed attempt left behind", async () => {
    rpcResponses.set("claim_next_drive_move", {
      data: [claimRow({ stale_drive_file_ids: ["old-orphan"] })],
      error: null,
    });

    await moveNextPhotoToDrive(RUN);

    expect(deleteFilePermanently).toHaveBeenCalledWith(
      "access-token",
      "old-orphan",
      "user-1",
    );
  });

  it("reports done when there is nothing left to claim", async () => {
    rpcResponses.set("claim_next_drive_move", { data: [], error: null });

    expect(await moveNextPhotoToDrive(RUN)).toEqual({ done: true });
    expect(getAccessToken).not.toHaveBeenCalled();
  });

  it("passes on a photo the database already marked as being published, without touching Drive", async () => {
    rpcResponses.set("claim_next_drive_move", {
      data: [claimRow({ job_status: "failed", error_code: "being_published" })],
      error: null,
    });

    const step = await moveNextPhotoToDrive(RUN);

    expect(step).toMatchObject({
      outcome: "failed",
      reason: "being_published",
    });
    expect(uploadDerivativeFile).not.toHaveBeenCalled();
    expect(rpcCalls("record_drive_move_failed")).toHaveLength(0);
  });

  it("reports a photo whose Supabase copy can't be read, and uploads nothing", async () => {
    downloadProcessedDerivativeForMove.mockRejectedValue(
      new Error("failed its hash check"),
    );

    const step = await moveNextPhotoToDrive(RUN);

    expect(step).toMatchObject({ outcome: "failed", reason: "source_missing" });
    expect(uploadDerivativeFile).not.toHaveBeenCalled();
  });

  it("stops the whole run when Drive refuses the upload (full Drive or revoked access)", async () => {
    uploadDerivativeFile.mockRejectedValue(
      new driveErrors.DriveApiError(
        "Drive derivative upload failed (403)",
        403,
      ),
    );

    await expect(moveNextPhotoToDrive(RUN)).rejects.toMatchObject({
      reason: "drive_unavailable",
    });
    expect(rpcCalls("record_drive_move_failed")[0][1]).toEqual({
      p_job_id: "job-1",
      p_error_code: "unknown",
    });
    expect(rpcCalls("switch_story_media_to_drive")).toHaveLength(0);
  });

  it("stops when the connection is gone", async () => {
    getAccessToken.mockRejectedValue(
      new driveErrors.DriveConnectionError("No active Google Drive connection"),
    );

    await expect(moveNextPhotoToDrive(RUN)).rejects.toMatchObject({
      reason: "drive_not_connected",
    });
  });

  it("stops when the database says the run is no longer active", async () => {
    rpcResponses.set("claim_next_drive_move", {
      data: null,
      error: { message: "move_run_not_active" },
    });

    const err = await moveNextPhotoToDrive(RUN).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DriveMoveFatalError);
    expect((err as DriveMoveFatalError).reason).toBe("run_not_active");
  });
});

describe("beginDriveMoveRun", () => {
  it("deletes due old copies first, then starts the run", async () => {
    rpcResponses.set("list_my_drive_move_cleanup_due", {
      data: [{ job_id: "old-job" }],
      error: null,
    });
    rpcResponses.set("begin_drive_move_run", {
      data: [{ run_id: RUN, total: 7 }],
      error: null,
    });

    expect(await beginDriveMoveRun()).toEqual({ runId: RUN, total: 7 });
    expect(deleteMovedSupabaseCopies).toHaveBeenCalledWith("old-job");
  });

  it("refuses a second run while one is going (Decision 13)", async () => {
    rpcResponses.set("list_my_drive_move_cleanup_due", {
      data: [],
      error: null,
    });
    rpcResponses.set("begin_drive_move_run", {
      data: null,
      error: { message: "move_already_running" },
    });

    await expect(beginDriveMoveRun()).rejects.toMatchObject({
      reason: "already_running",
    });
  });
});

describe("finishDriveMoveRun", () => {
  it("renumbers each touched story's Drive folder after the response", async () => {
    rpcResponses.set("finish_drive_move_run", {
      data: [{ story_id: "story-1" }, { story_id: "story-2" }],
      error: null,
    });
    rpcResponses.set("list_my_drive_move_cleanup_due", {
      data: [],
      error: null,
    });

    await finishDriveMoveRun(RUN);

    expect(syncStoryFolder).not.toHaveBeenCalled();
    await Promise.all(afterCalls.map((cb) => cb()));
    expect(syncStoryFolder).toHaveBeenCalledWith("user-1", "story-1");
    expect(syncStoryFolder).toHaveBeenCalledWith("user-1", "story-2");
  });
});
