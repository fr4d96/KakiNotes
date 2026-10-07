// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  uploadFileToDriveSession,
  beginAndUploadToDrive,
  DriveChunkUploadError,
  DriveUploadBeginError,
} from "@/lib/story/drive-upload-client";

function blobOfSize(bytes: number): Blob {
  return new Blob([new Uint8Array(bytes)]);
}

describe("uploadFileToDriveSession", () => {
  it("sends a single chunk with the right Content-Range for a small file", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ id: "drive-file-1" }), { status: 200 }),
      );
    const file = blobOfSize(1000);

    const id = await uploadFileToDriveSession(
      "https://upload.example/session",
      file,
      undefined,
      fetchMock,
    );

    expect(id).toBe("drive-file-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers["Content-Range"]).toBe("bytes 0-999/1000");
  });

  it("splits a file larger than one chunk into multiple 8 MiB PUTs", async () => {
    const CHUNK = 8 * 1024 * 1024;
    const totalSize = CHUNK + 100;
    const file = blobOfSize(totalSize);
    const fetchMock = vi.fn();
    fetchMock
      .mockResolvedValueOnce(
        new Response(null, {
          status: 308,
          headers: { Range: `bytes=0-${CHUNK - 1}` },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "drive-file-2" }), { status: 200 }),
      );

    const id = await uploadFileToDriveSession(
      "https://upload.example/session",
      file,
      undefined,
      fetchMock,
    );

    expect(id).toBe("drive-file-2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, firstInit] = fetchMock.mock.calls[0];
    expect(firstInit.headers["Content-Range"]).toBe(
      `bytes 0-${CHUNK - 1}/${totalSize}`,
    );
    const [, secondInit] = fetchMock.mock.calls[1];
    expect(secondInit.headers["Content-Range"]).toBe(
      `bytes ${CHUNK}-${totalSize - 1}/${totalSize}`,
    );
  });

  it("resumes from the Range header's upper bound on a 308, not from where it assumed it was", async () => {
    const CHUNK = 8 * 1024 * 1024;
    const totalSize = CHUNK * 2;
    const file = blobOfSize(totalSize);
    const fetchMock = vi.fn();
    // Server only confirms HALF of the first chunk landed -- a flaky
    // connection scenario. The next PUT must start from there, not from
    // the full chunk boundary we optimistically assumed.
    const confirmedUpperBound = CHUNK / 2 - 1;
    fetchMock
      .mockResolvedValueOnce(
        new Response(null, {
          status: 308,
          headers: { Range: `bytes=0-${confirmedUpperBound}` },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "drive-file-3" }), { status: 200 }),
      );

    await uploadFileToDriveSession(
      "https://upload.example/session",
      file,
      undefined,
      fetchMock,
    );

    const [, secondInit] = fetchMock.mock.calls[1];
    const resumedOffset = confirmedUpperBound + 1;
    const expectedEnd = Math.min(resumedOffset + CHUNK, totalSize) - 1;
    expect(secondInit.headers["Content-Range"]).toBe(
      `bytes ${resumedOffset}-${expectedEnd}/${totalSize}`,
    );
  });

  it("reports progress on each chunk", async () => {
    const CHUNK = 8 * 1024 * 1024;
    const totalSize = CHUNK + 100;
    const file = blobOfSize(totalSize);
    const fetchMock = vi.fn();
    fetchMock
      .mockResolvedValueOnce(
        new Response(null, {
          status: 308,
          headers: { Range: `bytes=0-${CHUNK - 1}` },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "drive-file-4" }), { status: 200 }),
      );
    const onProgress = vi.fn();

    await uploadFileToDriveSession(
      "https://upload.example/session",
      file,
      onProgress,
      fetchMock,
    );

    expect(onProgress).toHaveBeenCalledWith({
      sentBytes: CHUNK,
      totalBytes: totalSize,
    });
    expect(onProgress).toHaveBeenCalledWith({
      sentBytes: totalSize,
      totalBytes: totalSize,
    });
  });

  it("throws DriveChunkUploadError for an unexpected status", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 500 }));
    await expect(
      uploadFileToDriveSession(
        "https://upload.example/session",
        blobOfSize(10),
        undefined,
        fetchMock,
      ),
    ).rejects.toBeInstanceOf(DriveChunkUploadError);
  });

  it("throws if the final response carries no file id", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    await expect(
      uploadFileToDriveSession(
        "https://upload.example/session",
        blobOfSize(10),
        undefined,
        fetchMock,
      ),
    ).rejects.toBeInstanceOf(DriveChunkUploadError);
  });

  it("rejects an empty file without calling fetch", async () => {
    const fetchMock = vi.fn();
    await expect(
      uploadFileToDriveSession(
        "https://upload.example/session",
        blobOfSize(0),
        undefined,
        fetchMock,
      ),
    ).rejects.toBeInstanceOf(DriveChunkUploadError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("beginAndUploadToDrive", () => {
  it("begins the reservation, then uploads via the returned session URI", async () => {
    const beginUpload = vi.fn().mockResolvedValue({
      mediaId: "media-1",
      sessionUri: "https://upload.example/session-x",
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ id: "drive-file-5" }), { status: 200 }),
      );
    // uploadFileToDriveSession defaults to global fetch; stub it for this test.
    vi.stubGlobal("fetch", fetchMock);

    const result = await beginAndUploadToDrive(
      { revisionId: "rev-1", file: blobOfSize(10), mimeType: "image/jpeg" },
      beginUpload,
    );

    expect(result).toEqual({ mediaId: "media-1", driveFileId: "drive-file-5" });
    expect(beginUpload).toHaveBeenCalledWith("rev-1", "image/jpeg", 10);
    vi.unstubAllGlobals();
  });

  it("throws DriveUploadBeginError without ever calling fetch, when the reservation fails", async () => {
    const beginUpload = vi.fn().mockResolvedValue({ error: "no connection" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      beginAndUploadToDrive(
        { revisionId: "rev-1", file: blobOfSize(10), mimeType: "image/jpeg" },
        beginUpload,
      ),
    ).rejects.toBeInstanceOf(DriveUploadBeginError);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
