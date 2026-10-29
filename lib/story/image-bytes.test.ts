// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const rpcMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: rpcMock }),
}));

const downloadMediaPreviewBytes = vi.hoisted(() => vi.fn());
vi.mock("@/lib/story/image-pipeline", () => ({
  downloadMediaPreviewBytes: (...args: unknown[]) =>
    (downloadMediaPreviewBytes as (...a: unknown[]) => unknown)(...args),
}));

const getAccessToken = vi.hoisted(() => vi.fn(async () => "access-token"));
const downloadFileBytes = vi.hoisted(() => vi.fn());
vi.mock("@/lib/drive/drive-client", () => ({
  getAccessToken,
  downloadFileBytes: (...args: unknown[]) =>
    (downloadFileBytes as (...a: unknown[]) => unknown)(...args),
}));

import { getImageBytes } from "@/lib/story/image-bytes";

beforeEach(() => {
  rpcMock.mockReset();
  downloadMediaPreviewBytes.mockReset();
  getAccessToken.mockClear();
  downloadFileBytes.mockReset();
});

describe("getImageBytes", () => {
  it("calls downloadMediaPreviewBytes unchanged for a supabase row", async () => {
    downloadMediaPreviewBytes.mockResolvedValue({
      bytes: Buffer.from("x"),
      width: 10,
      height: 20,
    });

    const result = await getImageBytes({
      id: "media-1",
      storage_backend: "supabase",
    });

    expect(result).toEqual({ bytes: Buffer.from("x"), width: 10, height: 20 });
    expect(downloadMediaPreviewBytes).toHaveBeenCalledWith("media-1");
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("returns null for a supabase row whose derivative can't be downloaded", async () => {
    downloadMediaPreviewBytes.mockRejectedValue(new Error("no derivative"));
    const result = await getImageBytes({
      id: "media-1",
      storage_backend: "supabase",
    });
    expect(result).toBeNull();
  });

  it("fetches a google_drive row's bytes via the owner's token", async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          drive_processed_file_id: "drive-file-1",
          owner_user_id: "owner-1",
        },
      ],
      error: null,
    });
    // A 1x1 transparent PNG, so sharp can read real dimensions from it.
    const onePixelPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    );
    downloadFileBytes.mockResolvedValue(onePixelPng);

    const result = await getImageBytes({
      id: "media-2",
      storage_backend: "google_drive",
    });

    expect(getAccessToken).toHaveBeenCalledWith("owner-1");
    expect(downloadFileBytes).toHaveBeenCalledWith(
      "access-token",
      "drive-file-1",
    );
    expect(result?.width).toBe(1);
    expect(result?.height).toBe(1);
  });

  it("returns null for a google_drive row the RPC can't authorize", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    const result = await getImageBytes({
      id: "media-3",
      storage_backend: "google_drive",
    });
    expect(result).toBeNull();
    expect(downloadFileBytes).not.toHaveBeenCalled();
  });

  it("returns null when the Drive fetch itself fails", async () => {
    rpcMock.mockResolvedValue({
      data: [
        { drive_processed_file_id: "drive-file-1", owner_user_id: "owner-1" },
      ],
      error: null,
    });
    downloadFileBytes.mockRejectedValue(new Error("drive down"));
    const result = await getImageBytes({
      id: "media-4",
      storage_backend: "google_drive",
    });
    expect(result).toBeNull();
  });
});
