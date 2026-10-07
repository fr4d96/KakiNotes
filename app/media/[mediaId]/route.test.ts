// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const rpcMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: rpcMock }),
}));

const getAccessToken = vi.hoisted(() => vi.fn(async () => "access-token"));
const downloadFileBytes = vi.hoisted(() =>
  vi.fn(async () => Buffer.from("image-bytes")),
);
vi.mock("@/lib/drive/drive-client", () => ({
  getAccessToken,
  downloadFileBytes,
}));

import { GET } from "@/app/media/[mediaId]/route";

function requestFor(mediaId: string) {
  return {
    request: new NextRequest(`https://kakinotes.test/media/${mediaId}`),
    context: { params: Promise.resolve({ mediaId }) },
  };
}

beforeEach(() => {
  rpcMock.mockReset();
  getAccessToken.mockClear();
  downloadFileBytes.mockClear();
});

describe("GET /media/[mediaId]", () => {
  it("404s on a non-UUID id without calling the RPC", async () => {
    const { request, context } = requestFor("not-a-uuid");
    const response = await GET(request, context);
    expect(response.status).toBe(404);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("404s when the RPC returns no rows (not found)", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    const { request, context } = requestFor(
      "00000000-0000-4000-8000-000000000001",
    );
    const response = await GET(request, context);
    expect(response.status).toBe(404);
  });

  it("404s identically for a supabase-backed id (RPC also returns no rows for it)", async () => {
    // get_drive_media_for_proxy's own contract: a supabase-backend row is
    // filtered out at the SQL level, so from this route's point of view
    // it is indistinguishable from "not found" -- same zero-row shape.
    rpcMock.mockResolvedValue({ data: [], error: null });
    const { request, context } = requestFor(
      "00000000-0000-4000-8000-000000000002",
    );
    const response = await GET(request, context);
    expect(response.status).toBe(404);

    // Body is identical (empty) for both not-found and supabase-backed --
    // re-run the plain not-found case and diff the bytes.
    rpcMock.mockResolvedValue({ data: [], error: null });
    const { request: req2, context: ctx2 } = requestFor(
      "00000000-0000-4000-8000-000000000003",
    );
    const response2 = await GET(req2, ctx2);
    expect(await response.text()).toBe(await response2.text());
    expect(response.status).toBe(response2.status);
  });

  it("serves bytes with public caching for a published row", async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          media_id: "00000000-0000-4000-8000-000000000004",
          drive_processed_file_id: "drive-file-1",
          processed_mime_type: "image/jpeg",
          owner_user_id: "owner-1",
          is_published: true,
        },
      ],
      error: null,
    });
    const { request, context } = requestFor(
      "00000000-0000-4000-8000-000000000004",
    );
    const response = await GET(request, context);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      "public, s-maxage=300, stale-while-revalidate=60",
    );
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    // SMALL 3 (round A review): nosniff on every served image.
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  // SMALL 3 (round A review): only the pipeline's own output types are
  // ever served -- anything else 404s, never falls back to octet-stream.
  it("404s instead of serving octet-stream for a disallowed processed_mime_type", async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          media_id: "00000000-0000-4000-8000-000000000007",
          drive_processed_file_id: "drive-file-4",
          processed_mime_type: "application/pdf",
          owner_user_id: "owner-1",
          is_published: true,
        },
      ],
      error: null,
    });
    const { request, context } = requestFor(
      "00000000-0000-4000-8000-000000000007",
    );
    const response = await GET(request, context);
    expect(response.status).toBe(404);
    expect(downloadFileBytes).not.toHaveBeenCalled();
  });

  it("404s when processed_mime_type is null", async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          media_id: "00000000-0000-4000-8000-000000000008",
          drive_processed_file_id: "drive-file-5",
          processed_mime_type: null,
          owner_user_id: "owner-1",
          is_published: true,
        },
      ],
      error: null,
    });
    const { request, context } = requestFor(
      "00000000-0000-4000-8000-000000000008",
    );
    const response = await GET(request, context);
    expect(response.status).toBe(404);
    expect(downloadFileBytes).not.toHaveBeenCalled();
  });

  it("serves bytes with private no-store caching for a preview row", async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          media_id: "00000000-0000-4000-8000-000000000005",
          drive_processed_file_id: "drive-file-2",
          processed_mime_type: "image/jpeg",
          owner_user_id: "owner-1",
          is_published: false,
        },
      ],
      error: null,
    });
    const { request, context } = requestFor(
      "00000000-0000-4000-8000-000000000005",
    );
    const response = await GET(request, context);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("returns 502 with no-store when the Drive fetch itself fails", async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          media_id: "00000000-0000-4000-8000-000000000006",
          drive_processed_file_id: "drive-file-3",
          processed_mime_type: "image/jpeg",
          owner_user_id: "owner-1",
          is_published: true,
        },
      ],
      error: null,
    });
    downloadFileBytes.mockRejectedValueOnce(new Error("Drive is down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { request, context } = requestFor(
      "00000000-0000-4000-8000-000000000006",
    );
    const response = await GET(request, context);
    expect(response.status).toBe(502);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
});
