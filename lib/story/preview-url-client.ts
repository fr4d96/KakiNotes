import { mintPreviewUrlsAction } from "@/app/(contributor)/stories/[id]/media-actions";
import { MAX_PREVIEW_URLS_PER_BATCH } from "@/lib/story/preview-url-batch";

/**
 * Client-side front door for signed preview URLs, shared by PreviewGallery
 * and PreviewContentBody.
 *
 * Three things happen here that neither component should have to know
 * about:
 *
 *   1. Coalescing. Every getPreviewUrl() call made during one tick of the
 *      event loop is folded into ONE mintPreviewUrlsAction() round trip.
 *      The gallery and the body mount in the same commit and ask for
 *      overlapping id sets; they now share a single request instead of
 *      each walking the list one Server Action at a time.
 *   2. In-flight de-duplication. A second request for an id that is already
 *      on the wire waits for that same promise -- no double mint.
 *   3. A short cache, deliberately shorter than the signed URL's own
 *      120-second life (lib/story/image-pipeline.ts) so a URL handed out of
 *      the cache is never one the storage service is about to refuse.
 *
 * The result type is the per-id result the action itself returns, so a
 * component still sees the exact authorize/mint error for its own image.
 */
export type PreviewUrlResult = { url: string } | { error: string };

/**
 * Below the 120 s signed-URL expiry with a margin: an <img> that reads the
 * URL from the cache still has to actually start its request.
 */
const PREVIEW_URL_TTL_MS = 90_000;

const resolved = new Map<string, { result: PreviewUrlResult; at: number }>();
const inFlight = new Map<string, Promise<PreviewUrlResult>>();

let queued: Map<string, { resolve: (r: PreviewUrlResult) => void }> | null =
  null;

function flush() {
  const batch = queued;
  queued = null;
  if (!batch) return;
  const ids = [...batch.keys()];

  // Chunked only for the pathological case; a real revision's media list
  // is far below the cap, so this is one call.
  for (let i = 0; i < ids.length; i += MAX_PREVIEW_URLS_PER_BATCH) {
    const chunk = ids.slice(i, i + MAX_PREVIEW_URLS_PER_BATCH);
    void mintPreviewUrlsAction(chunk)
      .then((response) => {
        for (const id of chunk) {
          const result: PreviewUrlResult =
            "error" in response && typeof response.error === "string"
              ? { error: response.error }
              : ((response as Record<string, PreviewUrlResult>)[id] ?? {
                  error: "No preview URL returned.",
                });
          // Only successes are remembered: a failed mint (transient network
          // trouble, an image that finished processing a second later) should
          // be retried on the next mount, not replayed for 90 s.
          if ("url" in result) resolved.set(id, { result, at: Date.now() });
          // Cleared BEFORE resolving so a caller that re-requests the id
          // from inside its own .then (say, after an error) gets a fresh
          // request, not the promise that just settled.
          inFlight.delete(id);
          batch.get(id)?.resolve(result);
        }
      })
      .catch((error: unknown) => {
        const result: PreviewUrlResult = {
          error:
            error instanceof Error ? error.message : "Could not load image.",
        };
        for (const id of chunk) {
          inFlight.delete(id);
          batch.get(id)?.resolve(result);
        }
      });
  }
}

/**
 * Resolves to a signed preview URL (or the per-image error) for one media
 * id. Safe to call for many ids in a loop without awaiting between them --
 * that is precisely the pattern this module exists to make cheap.
 */
export function getPreviewUrl(mediaId: string): Promise<PreviewUrlResult> {
  const hit = resolved.get(mediaId);
  if (hit) {
    if (Date.now() - hit.at < PREVIEW_URL_TTL_MS) {
      return Promise.resolve(hit.result);
    }
    resolved.delete(mediaId);
  }

  const pending = inFlight.get(mediaId);
  if (pending) return pending;

  const promise = new Promise<PreviewUrlResult>((resolve) => {
    if (!queued) {
      queued = new Map();
      queueMicrotask(flush);
    }
    queued.set(mediaId, { resolve });
  });
  inFlight.set(mediaId, promise);
  return promise;
}

/** Test-only: forget everything cached or queued. */
export function resetPreviewUrlCacheForTests() {
  resolved.clear();
  inFlight.clear();
  queued = null;
}
