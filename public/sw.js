// Kakinotes service worker: an offline screen and NOTHING else.
//
// When a page cannot load -- the phone has no internet, or the host Mac /
// Cloudflare Tunnel is down and Cloudflare answers with its own 502/530
// error page -- show /offline.html (a "Kakinotes is offline" screen with a
// Refresh button) instead of the browser's or Cloudflare's error page.
//
// Privacy (Engineering Rules 12-14): the only file ever stored on the
// device is the one public, content-free page in OFFLINE_FILES. Pages,
// API calls, /media images and uploads are never cached, never stored and
// never answered from a cache: everything except a failed page load goes to
// the network exactly as if this worker did not exist. So nothing a reader
// loses access to (a draft, a rejected story, a revoked image) can linger
// on a phone because of this file.
//
// Updating: bump VERSION whenever offline.html or this file changes; the
// new worker re-downloads the page and deletes the old cache.
// See "Offline screen" in docs/architecture.md.

const VERSION = "v1";
const CACHE = `kakinotes-offline-${VERSION}`;
const OFFLINE_URL = "/offline.html";
// One self-contained file: the icon is inlined in it.
const OFFLINE_FILES = [OFFLINE_URL];

// The site is unreachable, not broken: 502/503/504 from a gateway, and
// Cloudflare's own 520-530 range (530 is what a down Tunnel returns, with
// error 1033). A 500 from the app itself is a real error page and passes
// through untouched, as do 404s and redirects.
function isUnreachableStatus(status) {
  return (status >= 502 && status <= 504) || (status >= 520 && status <= 530);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // `reload` skips the HTTP cache, so a new VERSION gets fresh files.
      .then((cache) =>
        cache.addAll(
          OFFLINE_FILES.map((url) => new Request(url, { cache: "reload" })),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith("kakinotes-") && name !== CACHE)
          .map((name) => caches.delete(name)),
      );
      // Starts the page request while the worker boots, so having a
      // worker never makes a page load slower.
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }
      await self.clients.claim();
    })(),
  );
});

async function offlineResponse() {
  const cached = await caches.match(OFFLINE_URL, { cacheName: CACHE });
  return (
    cached ||
    new Response("Kakinotes is offline. Please try again.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  // Only full page loads (typing a URL, opening the app, a reload). Never a
  // POST: a form submission is never replayed or swallowed.
  if (request.mode !== "navigate" || request.method !== "GET") return;

  event.respondWith(
    (async () => {
      try {
        const response =
          (await event.preloadResponse) || (await fetch(request));
        return isUnreachableStatus(response.status)
          ? offlineResponse()
          : response;
      } catch {
        // fetch() rejects only when there is no response at all: no
        // internet, DNS failure, connection refused.
        return offlineResponse();
      }
    })(),
  );
});
