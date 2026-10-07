import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { driveMediaIdSchema } from "@/lib/validation/drive";
import { getAccessToken, downloadFileBytes } from "@/lib/drive/drive-client";

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

// SMALL 3 (round A review): the only two MIME types lib/story/
// image-pipeline.ts#processImageBytesInMemory ever produces (see that
// function: processedMimeType is 'image/png' when the source sniffed as
// PNG, 'image/jpeg' otherwise -- never webp, never anything else). A row
// whose processed_mime_type isn't one of these is never served -- not as
// octet-stream, not at all -- since this proxy's one job is streaming a
// KNOWN-SAFE image type; anything else 404s exactly like "not found".
const ALLOWED_PROXY_MIME_TYPES = new Set(["image/jpeg", "image/png"]);

export async function GET(
  _request: NextRequest,
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
  const { data, error } = await supabase.rpc("get_drive_media_for_proxy", {
    p_media_id: parsedId.data,
  });

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

  const rows = (data ?? []) as unknown as ProxyLookupRow[];
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

  let bytes: Buffer;
  try {
    const accessToken = await getAccessToken(row.owner_user_id);
    bytes = await downloadFileBytes(accessToken, row.drive_processed_file_id);
  } catch (err) {
    console.error("Drive proxy fetch failed", {
      mediaId: parsedId.data,
      error: err instanceof Error ? err.message : err,
    });
    return driveFailure();
  }

  // Published: cacheable by a shared/CDN cache for a bounded window
  // (section 5 — 5 minutes, short enough that an unpublish/archive/reject
  // has a real, statable worst-case staleness). Anything else a
  // contributor/moderator is previewing: never cacheable by a shared
  // cache, same as today's signed-URL preview path.
  const cacheControl = row.is_published
    ? "public, s-maxage=300, stale-while-revalidate=60"
    : "private, no-store";

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": row.processed_mime_type,
      // SMALL 3: stops a browser from ever re-sniffing/re-interpreting
      // these bytes as something other than the declared, whitelisted
      // image type above.
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": cacheControl,
    },
  });
}
