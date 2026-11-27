// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";
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

const resizeForCard = vi.hoisted(() =>
  vi.fn(async () => Buffer.from("card-bytes")),
);
vi.mock("@/lib/story/card-photo-resize", () => ({ resizeForCard }));

import { GET } from "@/app/media/[mediaId]/route";

function requestFor(mediaId: string, query = "") {
  return {
    request: new NextRequest(`https://kakinotes.test/media/${mediaId}${query}`),
    context: { params: Promise.resolve({ mediaId }) },
  };
}

beforeEach(() => {
  rpcMock.mockReset();
  getAccessToken.mockClear();
  downloadFileBytes.mockClear();
  resizeForCard.mockClear();
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
    // Cached for days, because every visibility change purges this tag
    // (lib/story/public-cache.ts#purgePublicMediaCache).
    expect(response.headers.get("Cache-Control")).toBe(
      "public, s-maxage=604800, stale-while-revalidate=86400",
    );
    expect(response.headers.get("Vercel-Cache-Tag")).toBe("public-media");
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
    expect(response.headers.get("Vercel-Cache-Tag")).toBeNull();
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
    expect(response.headers.get("Vercel-Cache-Tag")).toBeNull();
  });

  describe("?download=1 (My Photos)", () => {
    const row = (isPublished: boolean) => ({
      data: [
        {
          media_id: "37cd5afe-6b32-444b-a27f-0f97d121f469",
          drive_processed_file_id: "drive-file-1",
          processed_mime_type: "image/png",
          owner_user_id: "owner-1",
          is_published: isPublished,
        },
      ],
      error: null,
    });

    it("saves the file instead of showing it, and never caches it publicly -- even when published", async () => {
      rpcMock.mockResolvedValue(row(true));
      const { request, context } = requestFor(
        "37cd5afe-6b32-444b-a27f-0f97d121f469",
        "?download=1",
      );
      const response = await GET(request, context);
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Disposition")).toBe(
        'attachment; filename="kakinotes-photo-37cd5afe.png"',
      );
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect(response.headers.get("Vercel-Cache-Tag")).toBeNull();
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    });

    it("goes through exactly the same authorization: no row, no file", async () => {
      rpcMock.mockResolvedValue({ data: [], error: null });
      const { request, context } = requestFor(
        "00000000-0000-4000-8000-000000000009",
        "?download=1",
      );
      const response = await GET(request, context);
      expect(response.status).toBe(404);
      expect(response.headers.get("Content-Disposition")).toBeNull();
      expect(downloadFileBytes).not.toHaveBeenCalled();
    });

    it("shows inline as before without the flag", async () => {
      rpcMock.mockResolvedValue(row(false));
      const { request, context } = requestFor(
        "37cd5afe-6b32-444b-a27f-0f97d121f469",
      );
      const response = await GET(request, context);
      expect(response.headers.get("Content-Disposition")).toBeNull();
    });
  });

  describe("?full=1 (full-quality copy, owner only)", () => {
    const ID = "37cd5afe-6b32-444b-a27f-0f97d121f469";

    it("serves the owner's full copy as a private download", async () => {
      rpcMock.mockImplementation(async (name: string) =>
        name === "get_drive_full_copy_for_owner"
          ? {
              data: [
                {
                  drive_full_file_id: "full-file-1",
                  full_mime_type: "image/jpeg",
                  owner_user_id: "owner-1",
                },
              ],
              error: null,
            }
          : { data: [], error: null },
      );
      const { request, context } = requestFor(ID, "?full=1");
      const response = await GET(request, context);

      expect(response.status).toBe(200);
      expect(downloadFileBytes).toHaveBeenCalledWith(
        "access-token",
        "full-file-1",
      );
      expect(response.headers.get("Content-Disposition")).toBe(
        'attachment; filename="kakinotes-photo-37cd5afe-full.jpg"',
      );
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect(response.headers.get("Vercel-Cache-Tag")).toBeNull();
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    });

    it("404s for anyone else (or no full copy), and never falls back to the reader lookup", async () => {
      rpcMock.mockResolvedValue({ data: [], error: null });
      const { request, context } = requestFor(ID, "?full=1");
      const response = await GET(request, context);

      expect(response.status).toBe(404);
      expect(downloadFileBytes).not.toHaveBeenCalled();
      expect(rpcMock.mock.calls.map(([name]) => name)).toEqual([
        "get_drive_full_copy_for_owner",
      ]);
    });
  });

  // The card-sized version (lib/story/card-photo-size.ts): same check, same
  // caching and purge tag, smaller WebP bytes.
  describe("?w= card sizes", () => {
    const publishedRow = {
      data: [
        {
          drive_processed_file_id: "drive-file-1",
          processed_mime_type: "image/jpeg",
          owner_user_id: "owner-1",
          is_published: true,
        },
      ],
      error: null,
    };

    it.each(["640", "1080"])(
      "serves a %spx WebP card version, cached and tagged like the photo",
      async (width) => {
        rpcMock.mockResolvedValue(publishedRow);
        const { request, context } = requestFor(
          "00000000-0000-4000-8000-000000000010",
          `?w=${width}`,
        );
        const response = await GET(request, context);
        expect(response.status).toBe(200);
        expect(resizeForCard).toHaveBeenCalledWith(
          Buffer.from("image-bytes"),
          Number(width),
        );
        expect(response.headers.get("Content-Type")).toBe("image/webp");
        expect(Buffer.from(await response.arrayBuffer()).toString()).toBe(
          "card-bytes",
        );
        expect(response.headers.get("Cache-Control")).toBe(
          "public, s-maxage=604800, stale-while-revalidate=86400",
        );
        expect(response.headers.get("Vercel-Cache-Tag")).toBe("public-media");
      },
    );

    it.each(["300", "640.0", "abc", ""])(
      "404s any other width (%j) before touching the database or Drive",
      async (width) => {
        const { request, context } = requestFor(
          "00000000-0000-4000-8000-000000000011",
          `?w=${width}`,
        );
        const response = await GET(request, context);
        expect(response.status).toBe(404);
        expect(rpcMock).not.toHaveBeenCalled();
        expect(downloadFileBytes).not.toHaveBeenCalled();
      },
    );

    it("still 404s an unauthorized photo asked for at a card size", async () => {
      rpcMock.mockResolvedValue({ data: [], error: null });
      const { request, context } = requestFor(
        "00000000-0000-4000-8000-000000000012",
        "?w=640",
      );
      const response = await GET(request, context);
      expect(response.status).toBe(404);
      expect(resizeForCard).not.toHaveBeenCalled();
    });

    it("keeps a preview private at a card size", async () => {
      rpcMock.mockResolvedValue({
        data: [{ ...publishedRow.data[0], is_published: false }],
        error: null,
      });
      const { request, context } = requestFor(
        "00000000-0000-4000-8000-000000000013",
        "?w=640",
      );
      const response = await GET(request, context);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect(response.headers.get("Vercel-Cache-Tag")).toBeNull();
    });
  });
});

// Stored card sizes (docs/photo-card-sizes-plan.md, Option B): ?w= asks
// get_drive_card_for_proxy(), serves the stored WebP when its hash matches,
// and otherwise behaves exactly as before (download + resize).
describe("GET /media/[mediaId]?w= stored card sizes", () => {
  const MEDIA = "00000000-0000-4000-8000-000000000020";
  const STORED = Buffer.from("stored-card-webp");
  const storedHash = createHash("sha256").update(STORED).digest("hex");
  const baseRow = {
    media_id: MEDIA,
    drive_processed_file_id: "drive-file-1",
    processed_mime_type: "image/jpeg",
    owner_user_id: "owner-1",
    is_published: true,
    story_id: "story-1",
    card_drive_file_id: "card-file-1",
    card_sha256: storedHash,
    card_file_size_bytes: STORED.byteLength,
  };

  function rpcFor(row: Record<string, unknown> | null) {
    rpcMock.mockImplementation(async (name: string) => {
      if (name === "get_drive_card_for_proxy") {
        return { data: row ? [row] : [], error: null };
      }
      throw new Error(`unexpected rpc ${name}`);
    });
  }

  beforeEach(() => {
    downloadFileBytes.mockReset();
    downloadFileBytes.mockResolvedValue(Buffer.from("image-bytes"));
  });

  it("serves the stored file with today's cache headers, without resizing", async () => {
    rpcFor(baseRow);
    downloadFileBytes.mockResolvedValueOnce(STORED);
    const { request, context } = requestFor(MEDIA, "?w=640");
    const response = await GET(request, context);
    expect(response.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith("get_drive_card_for_proxy", {
      p_media_id: MEDIA,
      p_width: 640,
    });
    expect(downloadFileBytes).toHaveBeenCalledTimes(1);
    expect(downloadFileBytes).toHaveBeenCalledWith(
      "access-token",
      "card-file-1",
    );
    expect(resizeForCard).not.toHaveBeenCalled();
    expect(response.headers.get("Content-Type")).toBe("image/webp");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(STORED);
    expect(response.headers.get("Cache-Control")).toBe(
      "public, s-maxage=604800, stale-while-revalidate=86400",
    );
    expect(response.headers.get("Vercel-Cache-Tag")).toBe("public-media");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("falls back to download + resize when there is no stored row", async () => {
    rpcFor({ ...baseRow, card_drive_file_id: null, card_sha256: null });
    const { request, context } = requestFor(MEDIA, "?w=1080");
    const response = await GET(request, context);
    expect(response.status).toBe(200);
    expect(downloadFileBytes).toHaveBeenCalledWith(
      "access-token",
      "drive-file-1",
    );
    expect(resizeForCard).toHaveBeenCalledWith(
      Buffer.from("image-bytes"),
      1080,
    );
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe(
      "card-bytes",
    );
  });

  it("falls back to resizing when the stored file's hash differs", async () => {
    rpcFor(baseRow);
    downloadFileBytes
      .mockResolvedValueOnce(Buffer.from("tampered"))
      .mockResolvedValueOnce(Buffer.from("image-bytes"));
    const { request, context } = requestFor(MEDIA, "?w=640");
    const response = await GET(request, context);
    expect(response.status).toBe(200);
    expect(downloadFileBytes).toHaveBeenNthCalledWith(
      2,
      "access-token",
      "drive-file-1",
    );
    expect(resizeForCard).toHaveBeenCalledTimes(1);
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe(
      "card-bytes",
    );
  });

  it("falls back to resizing when Drive fails on the stored file", async () => {
    rpcFor(baseRow);
    downloadFileBytes
      .mockRejectedValueOnce(new Error("drive 404"))
      .mockResolvedValueOnce(Buffer.from("image-bytes"));
    const { request, context } = requestFor(MEDIA, "?w=640");
    const response = await GET(request, context);
    expect(response.status).toBe(200);
    expect(resizeForCard).toHaveBeenCalledTimes(1);
  });

  it("still 502s when Drive fails on the fallback too", async () => {
    rpcFor(baseRow);
    downloadFileBytes.mockRejectedValue(new Error("drive down"));
    const { request, context } = requestFor(MEDIA, "?w=640");
    const response = await GET(request, context);
    expect(response.status).toBe(502);
  });

  it("404s exactly as before when the lookup returns no row (unauthorized)", async () => {
    rpcFor(null);
    const { request, context } = requestFor(MEDIA, "?w=640");
    const response = await GET(request, context);
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(getAccessToken).not.toHaveBeenCalled();
    expect(downloadFileBytes).not.toHaveBeenCalled();
  });

  it("keeps a preview private even when a stored copy exists", async () => {
    rpcFor({ ...baseRow, is_published: false });
    downloadFileBytes.mockResolvedValueOnce(STORED);
    const { request, context } = requestFor(MEDIA, "?w=640");
    const response = await GET(request, context);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Vercel-Cache-Tag")).toBeNull();
  });

  it("uses the plain lookup, never the stored copy, for ?download=1", async () => {
    rpcMock.mockImplementation(async (name: string) => {
      if (name === "get_drive_media_for_proxy") {
        return { data: [baseRow], error: null };
      }
      throw new Error(`unexpected rpc ${name}`);
    });
    const { request, context } = requestFor(MEDIA, "?w=640&download=1");
    const response = await GET(request, context);
    expect(response.status).toBe(200);
    expect(downloadFileBytes).toHaveBeenCalledWith(
      "access-token",
      "drive-file-1",
    );
    expect(resizeForCard).not.toHaveBeenCalled();
  });

  it("falls back to the plain lookup when the card lookup errors", async () => {
    rpcMock.mockImplementation(async (name: string) => {
      if (name === "get_drive_card_for_proxy") {
        return { data: null, error: { message: "function does not exist" } };
      }
      return { data: [baseRow], error: null };
    });
    const { request, context } = requestFor(MEDIA, "?w=640");
    const response = await GET(request, context);
    expect(response.status).toBe(200);
    expect(resizeForCard).toHaveBeenCalledTimes(1);
  });

  it("never uses the card lookup without ?w=", async () => {
    rpcMock.mockImplementation(async (name: string) => {
      if (name === "get_drive_media_for_proxy") {
        return { data: [baseRow], error: null };
      }
      throw new Error(`unexpected rpc ${name}`);
    });
    const { request, context } = requestFor(MEDIA);
    const response = await GET(request, context);
    expect(response.status).toBe(200);
    expect(downloadFileBytes).toHaveBeenCalledWith(
      "access-token",
      "drive-file-1",
    );
  });
});
