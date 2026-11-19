// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  uploadFileToDriveSession,
  beginAndUploadToDrive,
  DriveChunkUploadError,
  DriveUploadBeginError,
  DriveSessionExpiredError,
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
      .mockResolvedValue(new Response(null, { status: 400 }));
    await expect(
      uploadFileToDriveSession(
        "https://upload.example/session",
        blobOfSize(10),
        undefined,
        fetchMock,
        async () => {},
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

describe("uploadFileToDriveSession resume", () => {
  const CHUNK = 8 * 1024 * 1024;
  const uri = "https://upload.example/session";
  const net = () => new TypeError("Load failed");
  const ok = (id: string) =>
    new Response(JSON.stringify({ id }), { status: 200 });

  it("resumes from the reported byte after a network rejection", async () => {
    const file = blobOfSize(CHUNK * 2 + 10);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 308,
          headers: { Range: `bytes=0-${CHUNK - 1}` },
        }),
      )
      .mockRejectedValueOnce(net())
      .mockResolvedValueOnce(
        new Response(null, {
          status: 308,
          headers: { Range: `bytes=0-${CHUNK - 1}` },
        }),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 308,
          headers: { Range: `bytes=0-${CHUNK * 2 - 1}` },
        }),
      )
      .mockResolvedValueOnce(ok("done"));
    const wait = vi.fn().mockResolvedValue(undefined);
    const onPause = vi.fn();
    const id = await uploadFileToDriveSession(
      uri,
      file,
      undefined,
      fetchMock,
      wait,
      onPause,
    );
    expect(id).toBe("done");
    expect(wait).toHaveBeenCalledTimes(1);
    const query = fetchMock.mock.calls[2][1];
    expect(query.headers["Content-Range"]).toBe(`bytes */${file.size}`);
    expect(query.headers["Content-Length"]).toBe("0");
    expect(fetchMock.mock.calls[3][1].headers["Content-Range"]).toBe(
      `bytes ${CHUNK}-${CHUNK * 2 - 1}/${file.size}`,
    );
    expect(onPause.mock.calls).toEqual([[true], [false]]);
  });

  it("returns the id when the status query says the file finished", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(net())
      .mockResolvedValueOnce(ok("already-done"));
    const id = await uploadFileToDriveSession(
      uri,
      blobOfSize(500),
      undefined,
      fetchMock,
      async () => {},
    );
    expect(id).toBe("already-done");
  });

  it("throws DriveSessionExpiredError when the status query is 404", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(net())
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    await expect(
      uploadFileToDriveSession(
        uri,
        blobOfSize(500),
        undefined,
        fetchMock,
        async () => {},
      ),
    ).rejects.toBeInstanceOf(DriveSessionExpiredError);
  });

  it("treats a 503 as retryable and resumes from 0 when no Range", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 308 }))
      .mockResolvedValueOnce(ok("after-503"));
    const id = await uploadFileToDriveSession(
      uri,
      blobOfSize(500),
      undefined,
      fetchMock,
      async () => {},
    );
    expect(id).toBe("after-503");
    expect(fetchMock.mock.calls[2][1].headers["Content-Range"]).toBe(
      "bytes 0-499/500",
    );
  });

  it("gives up after 8 consecutive failures", async () => {
    const fetchMock = vi.fn().mockRejectedValue(net());
    const wait = vi.fn().mockResolvedValue(undefined);
    await expect(
      uploadFileToDriveSession(
        uri,
        blobOfSize(500),
        undefined,
        fetchMock,
        wait,
      ),
    ).rejects.toBeInstanceOf(DriveChunkUploadError);
    expect(fetchMock).toHaveBeenCalledTimes(8);
  });

  it("still throws immediately on a non-retryable 403", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 403 }));
    const wait = vi.fn();
    await expect(
      uploadFileToDriveSession(
        uri,
        blobOfSize(500),
        undefined,
        fetchMock,
        wait,
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });
});
