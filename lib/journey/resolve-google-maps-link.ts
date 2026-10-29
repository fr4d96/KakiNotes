import { isInsideNz } from "@/lib/journey/geo";
import {
  hasPlainHttpsOrigin,
  isGoogleHost,
  isGoogleMapsUrl,
  parseGoogleMapsUrl,
} from "@/lib/journey/google-maps-link";

/**
 * Server-side resolution of a pasted Google Maps link. Pure of auth and the
 * database (the server action wraps this); it only ever makes outbound
 * requests to Google's own hosts, to follow the redirect of a short link.
 *
 * SSRF guard: every URL we fetch (the pasted one and each redirect target)
 * must be https, without credentials or a port, on exactly maps.app.goo.gl,
 * goo.gl, google.<tld>, www.google.<tld> or maps.google.<tld>. Only the
 * Location header is read; the response body is never consumed. The URL is
 * never stored or logged.
 */

export type ResolveLinkFailure =
  "invalid" | "not_found" | "outside_nz" | "unreachable";

export type ResolveLinkResult =
  | { ok: true; latitude: number; longitude: number; placeName: string | null }
  | { ok: false; reason: ResolveLinkFailure };

export const MAX_LINK_LENGTH = 2048;
const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 5000;

function isShortLink(url: URL): boolean {
  if (!hasPlainHttpsOrigin(url)) return false;
  if (url.hostname === "maps.app.goo.gl") return url.pathname.length > 1;
  return url.hostname === "goo.gl" && url.pathname.startsWith("/maps/");
}

/** May we send a request to this URL? */
function isFetchable(url: URL): boolean {
  return (
    hasPlainHttpsOrigin(url) &&
    (url.hostname === "maps.app.goo.gl" ||
      url.hostname === "goo.gl" ||
      isGoogleHost(url.hostname))
  );
}

function finish(place: {
  latitude: number;
  longitude: number;
  placeName: string | null;
}): ResolveLinkResult {
  if (!isInsideNz(place)) return { ok: false, reason: "outside_nz" };
  return { ok: true, ...place };
}

export async function resolveGoogleMapsLink(
  input: string,
): Promise<ResolveLinkResult> {
  if (input.length > MAX_LINK_LENGTH) return { ok: false, reason: "invalid" };

  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return { ok: false, reason: "invalid" };
  }

  const direct = parseGoogleMapsUrl(url.href);
  if (direct) return finish(direct);
  if (isGoogleMapsUrl(url)) return { ok: false, reason: "not_found" };
  if (!isShortLink(url)) return { ok: false, reason: "invalid" };

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    let response: Response;
    try {
      response = await fetch(url.href, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { accept: "text/html", "user-agent": "Kakinotes/1.0" },
      });
    } catch {
      return { ok: false, reason: "unreachable" };
    }
    // Never read the body; free the connection.
    void response.body?.cancel().catch(() => {});

    const location = response.headers.get("location");
    if (response.status < 300 || response.status >= 400 || !location) {
      return { ok: false, reason: "not_found" };
    }

    let next: URL;
    try {
      next = new URL(location, url);
    } catch {
      return { ok: false, reason: "invalid" };
    }
    if (!isFetchable(next)) return { ok: false, reason: "invalid" };

    const parsed = parseGoogleMapsUrl(next.href);
    if (parsed) return finish(parsed);
    url = next;
  }
  return { ok: false, reason: "not_found" };
}
