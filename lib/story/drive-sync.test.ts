// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// next/server's after() runs its callback asynchronously, outside the
// request lifecycle it's actually meant for in this test harness -- here
// it's captured so a test can assert whether/what it schedules, and run it
// manually to check what it does once invoked.
const afterCalls: Array<() => unknown> = [];
vi.mock("next/server", () => ({
  after: (cb: () => unknown) => {
    afterCalls.push(cb);
  },
}));
async function runScheduled() {
  await Promise.all(afterCalls.map((cb) => cb()));
}

let currentUser: { id: string } | null = { id: "user-1" };
vi.mock("@/lib/auth/get-current-user", () => ({
  getCurrentUser: async () => currentUser,
}));

const rpcMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: rpcMock }),
}));

const getAccessToken = vi.hoisted(() => vi.fn(async () => "access-token"));
const ensureAppFolders = vi.hoisted(() =>
  vi.fn(async () => ({
    appFolderId: "app-folder",
    stagingFolderId: "staging-folder",
  })),
);
const startResumableUploadSession = vi.hoisted(() =>
  vi.fn(async () => ({ sessionUri: "https://upload.example/session" })),
);
const getFileMetadata = vi.hoisted(() => vi.fn());
const downloadFileBytes = vi.hoisted(() =>
  vi.fn(async () => Buffer.from("raw-bytes")),
);
const uploadDerivativeFile = vi.hoisted(() =>
  vi.fn(async () => "derivative-file-id"),
);
const deleteFilePermanently = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("@/lib/drive/drive-client", () => ({
  getAccessToken,
  ensureAppFolders,
  startResumableUploadSession,
  getFileMetadata,
  downloadFileBytes,
  uploadDerivativeFile,
  deleteFilePermanently,
}));

const processImageBytesInMemory = vi.hoisted(() =>
  vi.fn(async () => ({
    bytes: Buffer.from("processed-bytes"),
    processedMimeType: "image/jpeg" as const,
    sourceMimeType: "image/jpeg" as const,
    sourceWidth: 100,
    sourceHeight: 100,
    processedWidth: 100,
    processedHeight: 100,
    sha256: "abc123",
  })),
);
vi.mock("@/lib/story/image-pipeline", () => ({
  processImageBytesInMemory,
}));

// drive-folders.ts owns story-folder creation/renumbering -- exercised on
// its own in lib/story/drive-folders.test.ts. Here it's mocked so these
// tests stay focused on finalizeDriveMediaUpload's own verify/pipeline/
// record/delete contract.
const ensureStoryFolder = vi.hoisted(() =>
  vi.fn(async () => "story-folder-id"),
);
const syncStoryFolder = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/story/drive-folders", () => ({
  ensureStoryFolder,
  syncStoryFolder,
  // Real, pure implementation -- not worth mocking (lib/story/drive-
  // folders.test.ts already covers it directly).
  extensionForMimeType: (mimeType: string | null | undefined) =>
    mimeType === "image/png" ? "png" : "jpg",
}));

import {
  beginDriveMediaUpload,
  finalizeDriveMediaUpload,
  getStoryMediaUploadMode,
  DriveFinalizeRejectedError,
} from "@/lib/story/drive-sync";

const VALID_METADATA = {
  id: "drive-file-1",
  name: "staging-media-1",
  size: 1000,
  parents: ["staging-folder"],
  appProperties: {
    kakinotes_stage: "raw",
    kakinotes_reservation: "media-1",
    kakinotes_declared_mime: "image/jpeg",
  },
};

beforeEach(() => {
  afterCalls.length = 0;
  currentUser = { id: "user-1" };
  rpcMock.mockReset();
  getAccessToken.mockClear();
  ensureAppFolders.mockClear();
  startResumableUploadSession.mockClear();
  getFileMetadata.mockReset();
  downloadFileBytes.mockClear();
  uploadDerivativeFile.mockClear();
  deleteFilePermanently.mockClear();
  processImageBytesInMemory.mockClear();
  ensureStoryFolder.mockClear();
  ensureStoryFolder.mockResolvedValue("story-folder-id");
  syncStoryFolder.mockClear();
  getFileMetadata.mockResolvedValue({ ...VALID_METADATA });
});

describe("beginDriveMediaUpload", () => {
  it("reserves via the RPC, then opens a resumable session and returns only the session URI", async () => {
    rpcMock.mockResolvedValue({ data: [{ media_id: "media-1" }], error: null });

    const result = await beginDriveMediaUpload(
      "revision-1",
      "image/jpeg",
      1000,
    );

    expect(result).toEqual({
      mediaId: "media-1",
      sessionUri: "https://upload.example/session",
    });
    expect(rpcMock).toHaveBeenCalledWith("begin_drive_media_upload", {
      p_revision_id: "revision-1",
      p_source_mime_type: "image/jpeg",
    });
  });

  it("throws when the reservation RPC fails, without calling Drive", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "nope" } });
    await expect(
      beginDriveMediaUpload("revision-1", "image/jpeg", 1000),
    ).rejects.toThrow();
    expect(getAccessToken).not.toHaveBeenCalled();
  });
});

describe("finalizeDriveMediaUpload", () => {
  function expectNoDownloadOrDelete() {
    expect(downloadFileBytes).not.toHaveBeenCalled();
    expect(deleteFilePermanently).not.toHaveBeenCalled();
    expect(processImageBytesInMemory).not.toHaveBeenCalled();
  }

  it("rejects when the pre-check RPC (edit rights / reservation state) fails, before any Drive call", async () => {
    rpcMock.mockResolvedValue({ error: { message: "not authorized" } });

    await expect(
      finalizeDriveMediaUpload("media-1", 1, "drive-file-1"),
    ).rejects.toBeInstanceOf(DriveFinalizeRejectedError);
    expect(getAccessToken).not.toHaveBeenCalled();
    expectNoDownloadOrDelete();
  });

  it("rejects a forged reservation id, with no download and no delete", async () => {
    rpcMock.mockResolvedValue({ error: null, data: "story-1" }); // pre-check passes
    getFileMetadata.mockResolvedValue({
      ...VALID_METADATA,
      appProperties: {
        ...VALID_METADATA.appProperties,
        kakinotes_reservation: "someone-elses-media",
      },
    });

    await expect(
      finalizeDriveMediaUpload("media-1", 1, "drive-file-1"),
    ).rejects.toBeInstanceOf(DriveFinalizeRejectedError);
    expectNoDownloadOrDelete();
  });

  it("rejects the wrong stage, with no download and no delete", async () => {
    rpcMock.mockResolvedValue({ error: null, data: "story-1" });
    getFileMetadata.mockResolvedValue({
      ...VALID_METADATA,
      appProperties: {
        ...VALID_METADATA.appProperties,
        kakinotes_stage: "processed",
      },
    });

    await expect(
      finalizeDriveMediaUpload("media-1", 1, "drive-file-1"),
    ).rejects.toBeInstanceOf(DriveFinalizeRejectedError);
    expectNoDownloadOrDelete();
  });

  it("rejects the wrong parent folder, with no download and no delete", async () => {
    rpcMock.mockResolvedValue({ error: null, data: "story-1" });
    getFileMetadata.mockResolvedValue({
      ...VALID_METADATA,
      parents: ["some-other-folder"],
    });

    await expect(
      finalizeDriveMediaUpload("media-1", 1, "drive-file-1"),
    ).rejects.toBeInstanceOf(DriveFinalizeRejectedError);
    expectNoDownloadOrDelete();
  });

  it("rejects an oversized file, with no download and no delete", async () => {
    rpcMock.mockResolvedValue({ error: null, data: "story-1" });
    getFileMetadata.mockResolvedValue({
      ...VALID_METADATA,
      size: 999_999_999,
    });

    await expect(
      finalizeDriveMediaUpload("media-1", 1, "drive-file-1"),
    ).rejects.toBeInstanceOf(DriveFinalizeRejectedError);
    expectNoDownloadOrDelete();
  });

  it("happy path: download -> pipeline -> upload -> record, in that order, responding BEFORE delete/sync", async () => {
    rpcMock.mockImplementation(async (name: string) => {
      if (name === "authorize_drive_media_finalize_v2") {
        return { error: null, data: "story-1" };
      }
      if (name === "list_story_drive_media_for_sync") {
        return { data: [], error: null }; // no existing Drive media -- next number is 1
      }
      if (name === "finalize_drive_media_upload") return { error: null };
      throw new Error(`unexpected rpc ${name}`);
    });

    const order: string[] = [];
    downloadFileBytes.mockImplementation(async () => {
      order.push("download");
      return Buffer.from("raw-bytes");
    });
    processImageBytesInMemory.mockImplementation(async () => {
      order.push("pipeline");
      return {
        bytes: Buffer.from("processed-bytes"),
        processedMimeType: "image/jpeg" as const,
        sourceMimeType: "image/jpeg" as const,
        sourceWidth: 100,
        sourceHeight: 100,
        processedWidth: 100,
        processedHeight: 100,
        sha256: "abc123",
      };
    });
    uploadDerivativeFile.mockImplementation(async () => {
      order.push("upload");
      return "derivative-file-id";
    });
    const originalRpc = rpcMock.getMockImplementation();
    rpcMock.mockImplementation(async (name: string, args: unknown) => {
      if (name === "finalize_drive_media_upload") order.push("record");
      return originalRpc!(name, args);
    });
    deleteFilePermanently.mockImplementation(async () => {
      order.push("delete");
    });

    await finalizeDriveMediaUpload("media-1", 1, "drive-file-1");

    // Delete/sync are NOT in this order yet -- they're deferred to after(),
    // which this call only SCHEDULES, never awaits.
    expect(order).toEqual(["download", "pipeline", "upload", "record"]);
    expect(afterCalls).toHaveLength(1);
    expect(syncStoryFolder).not.toHaveBeenCalled();
    expect(deleteFilePermanently).not.toHaveBeenCalled();

    // The derivative is written straight into the STORY's own Drive folder
    // (ensureStoryFolder()'s mocked return), never the bare app folder, and
    // is named by its final position (01.ext) at upload time -- no content
    // hash, no rename needed later.
    expect(ensureStoryFolder).toHaveBeenCalledWith(
      expect.anything(),
      "access-token",
      "user-1",
      "story-1",
    );
    expect(uploadDerivativeFile).toHaveBeenCalledWith(
      "access-token",
      "story-folder-id",
      "01.jpg",
      expect.any(Buffer),
      "image/jpeg",
      "user-1",
    );

    // Once the deferred work actually runs, it deletes the raw staging
    // file and runs the best-effort renumber -- in that order.
    await runScheduled();
    expect(order).toEqual([
      "download",
      "pipeline",
      "upload",
      "record",
      "delete",
    ]);
    expect(syncStoryFolder).toHaveBeenCalledWith("user-1", "story-1");
  });

  // NOTE (round A review, SMALL 4): this test's assertion changed from the
  // original slice. The raw STAGING file (drive-file-1) is still never
  // deleted when recording fails -- it is only ever deleted after a
  // successful record, per the module's documented order. What's new is
  // a best-effort cleanup delete of the DERIVATIVE this function had
  // already uploaded (derivative-file-id) -- otherwise that file would be
  // orphaned in the contributor's real Kakinotes folder with nothing in
  // the DB pointing at it, and the slice-4 sweep (which only ever looks
  // at the staging subfolder) could never find it.
  it("does not delete the raw staging file, but does clean up the orphaned derivative, if recording fails", async () => {
    rpcMock.mockImplementation(async (name: string) => {
      if (name === "authorize_drive_media_finalize_v2") {
        return { error: null, data: "story-1" };
      }
      if (name === "list_story_drive_media_for_sync") {
        return { data: [], error: null };
      }
      if (name === "finalize_drive_media_upload") {
        return { error: { message: "db down" } };
      }
      throw new Error(`unexpected rpc ${name}`);
    });

    await expect(
      finalizeDriveMediaUpload("media-1", 1, "drive-file-1"),
    ).rejects.toThrow(/finalize_drive_media_upload failed/);
    expect(deleteFilePermanently).toHaveBeenCalledTimes(1);
    expect(deleteFilePermanently).toHaveBeenCalledWith(
      "access-token",
      "derivative-file-id",
      "user-1",
    );
    // Never called with the raw staging file id.
    expect(deleteFilePermanently).not.toHaveBeenCalledWith(
      "access-token",
      "drive-file-1",
      "user-1",
    );
    // This failure happens BEFORE the deferred-work point -- nothing was
    // ever scheduled via after().
    expect(afterCalls).toHaveLength(0);
  });

  it("logs, but does not throw, when the best-effort derivative cleanup delete itself fails", async () => {
    rpcMock.mockImplementation(async (name: string) => {
      if (name === "authorize_drive_media_finalize_v2") {
        return { error: null, data: "story-1" };
      }
      if (name === "list_story_drive_media_for_sync") {
        return { data: [], error: null };
      }
      if (name === "finalize_drive_media_upload") {
        return { error: { message: "db down" } };
      }
      throw new Error(`unexpected rpc ${name}`);
    });
    deleteFilePermanently.mockRejectedValueOnce(new Error("drive 500"));
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await expect(
      finalizeDriveMediaUpload("media-1", 1, "drive-file-1"),
    ).rejects.toThrow(/finalize_drive_media_upload failed/);
    expect(consoleError).toHaveBeenCalled();
  });
});

// Round B: the server-side upload-mode decision the editor's uploader
// follows. Never trusts the client -- only ever reads the RPC's answer,
// and defaults to "supabase" on any uncertainty.
describe("getStoryMediaUploadMode", () => {
  it("returns google_drive when the RPC says so", async () => {
    rpcMock.mockResolvedValue({ data: "google_drive", error: null });
    expect(await getStoryMediaUploadMode("revision-1")).toBe("google_drive");
    expect(rpcMock).toHaveBeenCalledWith("get_story_media_upload_mode", {
      p_revision_id: "revision-1",
    });
  });

  it("returns supabase when the RPC says so", async () => {
    rpcMock.mockResolvedValue({ data: "supabase", error: null });
    expect(await getStoryMediaUploadMode("revision-1")).toBe("supabase");
  });

  it("defaults to supabase when the RPC errors", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "nope" } });
    expect(await getStoryMediaUploadMode("revision-1")).toBe("supabase");
  });

  it("defaults to supabase when the RPC throws", async () => {
    rpcMock.mockRejectedValue(new Error("network down"));
    expect(await getStoryMediaUploadMode("revision-1")).toBe("supabase");
  });

  it("defaults to supabase for any value other than exactly 'google_drive'", async () => {
    rpcMock.mockResolvedValue({ data: "something_else", error: null });
    expect(await getStoryMediaUploadMode("revision-1")).toBe("supabase");
  });
});
