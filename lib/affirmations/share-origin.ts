/**
 * The origin a share link should point at: the host this request was served
 * on, so a link copied on kakinotes.vercel.app (or localhost, or a preview)
 * opens on that same deployment.
 *
 * NOT NEXT_PUBLIC_SITE_URL first: on Vercel that was set to one immutable
 * deployment URL (kakinotes-c2en8qt0k-…vercel.app), frozen before
 * /notes/[token] existed, so every copied link 404'd there (2026-10-31).
 * The env var is only the fallback when no host header is present.
 *
 * The host header is caller-controlled, but the URL built from it is shown
 * only to the signed-in owner on their own page -- it is never stored, sent
 * or rendered to anyone else.
 */
export function shareOriginFromHeaders(
  headers: Pick<Headers, "get">,
  fallback: string = process.env.NEXT_PUBLIC_SITE_URL ||
    "http://localhost:3000",
): string {
  const host = (headers.get("x-forwarded-host") ?? headers.get("host"))
    ?.split(",")[0]
    ?.trim();
  if (!host) return fallback.replace(/\/+$/, "");

  const forwardedProto = headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();
  const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  const proto =
    forwardedProto === "http" || forwardedProto === "https"
      ? forwardedProto
      : isLocal
        ? "http"
        : "https";

  return `${proto}://${host}`;
}
