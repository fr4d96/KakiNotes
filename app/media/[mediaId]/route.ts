import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { driveMediaIdSchema } from "@/lib/validation/drive";
import { getAccessToken, downloadFileBytes } from "@/lib/drive/drive-client";
import { photoDownloadFilename } from "@/lib/story/photo-download-name";
import { parseCardPhotoWidth } from "@/lib/story/card-photo-size";
import { resizeForCard } from "@/lib/story/card-photo-resize";
import {
  PUBLIC_MEDIA_CACHE_CONTROL,
  PUBLIC_MEDIA_TAG,
} from "@/lib/story/public-media-cache";

/**
 * docs/google-drive-integration.md section 5. Serves `google_drive`-backend
 * media ONLY — a `supabase`-backend row gets the identical 404 a missing
 * id gets, so this route can never become a second, unaudited path into
 * either Supabase bucket (Engineering Rule 13's Drive-aware wording).
 *
 * Not inside any route group: it has to serve anonymous readers,
 * signed-in contributors, and moderators alike, each via a different
 * authorization branch — all of that lives inside
 * get_drive_media_for_proxy() (supabase/migrations/20261007063355_
 * story_media_drive_backend.sql), never re-implemented here. This handler
 * only: validates the id shape, calls that one RPC on the CALLER's own
 * regular (RLS-respecting) session client, and — if authorized — fetches
 * bytes from the owning contributor's Drive and streams them back.
 *
 * node runtime (not Edge): this calls lib/drive/drive-client.ts, which
 * calls lib/drive/token-store.ts, which needs node:crypto for decryption —
 * same reasoning as every other Drive-touching route in this codebase.
 */
export const runtime = "nodejs";

// Round A (server/database/proxy only) ships no placeholder image — that
// is slice 5 (docs/google-drive-integration.md section 11), explicitly out
// of scope here. A Drive-side failure for an otherwise-authorized request
// is a real 502 for now, never a raw unhandled exception.
function notFound(): NextResponse {
  return new NextResponse(null, {
    status: 404,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function driveFailure(): NextResponse {
  return new NextResponse(null, {
    status: 502,
    headers: { "Cache-Control": "private, no-store" },
  });
}

type ProxyLookupRow = {
  media_id: string;
  drive_processed_file_id: string;
  processed_mime_type: string | null;
  owner_user_id: string | null;
  is_published: boolean;
};

// get_drive_card_for_proxy(): the same row plus the stored card-size copy
// (the card_* columns are null when there is none to use).
type CardLookupRow = ProxyLookupRow & {
  card_drive_file_id?: string | null;
  card_sha256?: string | null;
};

// SMALL 3 (round A review): the only two MIME types lib/story/
// image-pipeline.ts#processImageBytesInMemory ever produces (see that
// function: processedMimeType is 'image/png' when the source sniffed as
// PNG, 'image/jpeg' otherwise -- never webp, never anything else). A row
// whose processed_mime_type isn't one of these is never served -- not as
// octet-stream, not at all -- since this proxy's one job is streaming a
// KNOWN-SAFE image type; anything else 404s exactly like "not found".
const ALLOWED_PROXY_MIME_TYPES = new Set(["image/jpeg", "image/png"]);

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ mediaId: string }> },
): Promise<NextResponse> {
  const { mediaId: rawMediaId } = await context.params;
  const parsedId = driveMediaIdSchema.safeParse(rawMediaId);
  if (!parsedId.success) {
    // An invalid id shape is indistinguishable from "not found" — never a
    // 400 that would let a caller probe for which ids are well-formed vs
    // real.
    return notFound();
  }

  const supabase = await createClient();

  // ?full=1: the full-quality copy (owner decision 2026-10-11). A separate,
  // owner-only lookup -- never get_drive_media_for_proxy(), which also
  // answers for readers and staff. Always a private download; zero rows
  // (anyone else, or no full copy) is the same 404 as everything else here.
  if (request.nextUrl.searchParams.get("full") === "1") {
    return serveFullQualityCopy(supabase, parsedId.data);
  }

  // ?w=640|1080: the card-sized version (lib/story/card-photo-size.ts). Any
  // other ?w is the same 404 as a missing photo, so the cache can't be
  // flooded with arbitrary sizes. Checked before any database or Drive work.
  const rawWidth = request.nextUrl.searchParams.get("w");
  const cardWidth = parseCardPhotoWidth(rawWidth);
  if (rawWidth !== null && cardWidth === null) {
    return notFound();
  }

  const isDownload = request.nextUrl.searchParams.get("download") === "1";
  const wantsCard = cardWidth !== null && !isDownload;

  // A card size asks get_drive_card_for_proxy(), which CALLS
  // get_drive_media_for_proxy() for the authorization and only adds the
  // stored copy -- zero rows means the same 404. If it errors (say the
  // migration isn't there), fall back to the plain lookup: same
  // authorization, resize on demand.
  let data: unknown = null;
  let error: { message: string } | null = null;
  if (wantsCard) {
    ({ data, error } = await supabase.rpc("get_drive_card_for_proxy", {
      p_media_id: parsedId.data,
      p_width: cardWidth,
    }));
    if (error) {
      console.error("get_drive_card_for_proxy failed; resizing instead", {
        mediaId: parsedId.data,
        error: error.message,
      });
    }
  }
  if (!wantsCard || error) {
    ({ data, error } = await supabase.rpc("get_drive_media_for_proxy", {
      p_media_id: parsedId.data,
    }));
  }

  if (error) {
    // A DB-level error here is an infrastructure problem, not proof the
    // media doesn't exist — still answer with the same body shape as
    // "not found" rather than leaking a DB error message, but log it.
    console.error("get_drive_media_for_proxy failed", {
      mediaId: parsedId.data,
      error: error.message,
    });
    return notFound();
  }

  const rows = (data ?? []) as unknown as CardLookupRow[];
  const row = rows[0];
  // Zero rows: no such media, a supabase-backend row, or an unauthorized
  // google_drive row — all answered identically (Rule 12/13).
  if (!row || !row.owner_user_id) {
    return notFound();
  }

  // SMALL 3: never serve (or even attempt to fetch) a row whose recorded
  // MIME type isn't one the pipeline actually produces — see the constant
  // above. This is a defense-in-depth check: finalize_drive_media_upload
  // only ever records what processImageBytesInMemory returned, so this
  // should never actually trigger, but the proxy itself must never trust
  // a DB value as implicitly safe to serve as-is.
  if (
    !row.processed_mime_type ||
    !ALLOWED_PROXY_MIME_TYPES.has(row.processed_mime_type)
  ) {
    return notFound();
  }

  let bytes: Buffer | null = null;
  let contentType = row.processed_mime_type;
  let accessToken: string | null = null;

  // The stored card size, when there is one: a small WebP made at upload
  // from the stripped derivative. Anything wrong with it (Drive error, hash
  // differs) falls through to the download-and-resize path below.
  if (wantsCard && row.card_drive_file_id && row.card_sha256) {
    try {
      accessToken = await getAccessToken(row.owner_user_id);
      const stored = await downloadFileBytes(
        accessToken,
        row.card_drive_file_id,
      );
      const hash = createHash("sha256").update(stored).digest("hex");
      if (hash === row.card_sha256) {
        bytes = stored;
        contentType = "image/webp";
      } else {
        console.error("Stored card size hash mismatch; resizing instead", {
          mediaId: parsedId.data,
        });
      }
    } catch (err) {
      console.error("Stored card size fetch failed; resizing instead", {
        mediaId: parsedId.data,
        error: err instanceof Error ? err.message : err,
      });
    }
  }

  if (!bytes) {
    try {
      accessToken ??= await getAccessToken(row.owner_user_id);
      bytes = await downloadFileBytes(accessToken, row.drive_processed_file_id);
    } catch (err) {
      console.error("Drive proxy fetch failed", {
        mediaId: parsedId.data,
        error: err instanceof Error ? err.message : err,
      });
      return driveFailure();
    }

    // The card size, made on demand: same authorization and caching as the
    // full photo, only smaller bytes. A download always gets the full photo.
    if (wantsCard) {
      try {
        bytes = await resizeForCard(bytes, cardWidth);
        contentType = "image/webp";
      } catch (err) {
        console.error("Card photo resize failed", {
          mediaId: parsedId.data,
          error: err instanceof Error ? err.message : err,
        });
        return driveFailure();
      }
    }
  }

  // Published: cached by the CDN for days (lib/story/public-media-cache.ts)
  // and tagged, so an unpublish/archive/reject/takedown purges it at once
  // instead of waiting out the window (section 5's active purge). Anything
  // else a contributor/moderator is previewing: never cacheable by a shared
  // cache, same as today's signed-URL preview path.
  //
  // ?download=1 (My Photos, section 7): the same bytes and the same
  // authorization, but saved as a file instead of shown -- and never put in
  // a shared cache, whatever the photo's status.
  const sharedCache = row.is_published && !isDownload;
  const cacheControl = sharedCache
    ? PUBLIC_MEDIA_CACHE_CONTROL
    : "private, no-store";

  const headers: Record<string, string> = {
    "Content-Type": contentType,
    // SMALL 3: stops a browser from ever re-sniffing/re-interpreting
    // these bytes as something other than the declared, whitelisted
    // image type above.
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": cacheControl,
  };
  if (sharedCache) {
    // What purgePublicMediaCache() deletes by (lib/story/public-cache.ts).
    headers["Vercel-Cache-Tag"] = PUBLIC_MEDIA_TAG;
  }
  if (isDownload) {
    headers["Content-Disposition"] =
      `attachment; filename="${photoDownloadFilename(
        parsedId.data,
        row.processed_mime_type,
      )}"`;
  }

  return new NextResponse(new Uint8Array(bytes), { status: 200, headers });
}

async function serveFullQualityCopy(
  supabase: Awaited<ReturnType<typeof createClient>>,
  mediaId: string,
): Promise<NextResponse> {
  const { data, error } = await supabase.rpc("get_drive_full_copy_for_owner", {
    p_media_id: mediaId,
  });
  if (error) {
    console.error("get_drive_full_copy_for_owner failed", {
      mediaId,
      error: error.message,
    });
    return notFound();
  }
  const row = (data ?? [])[0];
  if (
    !row ||
    !row.owner_user_id ||
    !ALLOWED_PROXY_MIME_TYPES.has(row.full_mime_type)
  ) {
    return notFound();
  }

  let bytes: Buffer;
  try {
    const accessToken = await getAccessToken(row.owner_user_id);
    bytes = await downloadFileBytes(accessToken, row.drive_full_file_id);
  } catch (err) {
    console.error("Drive proxy full-copy fetch failed", {
      mediaId,
      error: err instanceof Error ? err.message : err,
    });
    return driveFailure();
  }

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": row.full_mime_type,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="${photoDownloadFilename(
        mediaId,
        row.full_mime_type,
        "full",
      )}"`,
    },
  });
}
