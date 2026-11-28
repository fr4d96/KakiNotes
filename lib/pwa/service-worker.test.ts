// Runs the real public/sw.js in a fake service-worker scope and checks the
// two things that matter: it shows the offline screen when a page can't
// load, and it never caches or answers anything else (Engineering Rules
// 12-14 -- no story content may linger on a device).
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const source = readFileSync(
  path.join(process.cwd(), "public", "sw.js"),
  "utf8",
);

type Listener = (event: unknown) => void;

const OFFLINE_BODY = "<h1>Kakinotes is offline</h1>";

function load() {
  const listeners: Record<string, Listener> = {};
  const added: string[] = [];
  const deleted: string[] = [];
  const cache = {
    addAll: vi.fn(async (requests: Request[]) => {
      added.push(...requests.map((r) => new URL(r.url).pathname));
    }),
  };
  const caches = {
    open: vi.fn(async () => cache),
    keys: vi.fn(async () => [
      "kakinotes-offline-v0",
      "kakinotes-offline-v1",
      "someone-elses-cache",
    ]),
    delete: vi.fn(async (name: string) => {
      deleted.push(name);
      return true;
    }),
    match: vi.fn(async (url: string) =>
      url === "/offline.html"
        ? new Response(OFFLINE_BODY, {
            headers: { "Content-Type": "text/html" },
          })
        : undefined,
    ),
  };
  const fetchMock = vi.fn<(r: Request) => Promise<Response>>();
  const self = {
    addEventListener: (type: string, fn: Listener) => {
      listeners[type] = fn;
    },
    skipWaiting: vi.fn(async () => {}),
    clients: { claim: vi.fn(async () => {}) },
    registration: { navigationPreload: { enable: vi.fn(async () => {}) } },
  };
  // Resolve relative URLs (new Request("/offline.html")) against the site.
  class SiteRequest extends Request {
    constructor(input: string, init?: RequestInit) {
      super(new URL(input, "https://notes.example.test"), init);
    }
  }
  vm.runInNewContext(source, {
    self,
    caches,
    fetch: fetchMock,
    Request: SiteRequest,
    Response,
    Promise,
  });
  return { listeners, caches, cache, added, deleted, fetchMock, self };
}

function fetchEvent(init: {
  mode: string;
  method?: string;
  preload?: Response;
}) {
  const request = {
    mode: init.mode,
    method: init.method ?? "GET",
    url: "https://notes.example.test/stories",
  };
  let responded: Promise<Response> | undefined;
  return {
    event: {
      request,
      preloadResponse: Promise.resolve(init.preload),
      respondWith: (p: Promise<Response>) => {
        responded = p;
      },
    },
    get responded() {
      return responded;
    },
  };
}

let sw: ReturnType<typeof load>;
beforeEach(() => {
  sw = load();
});

describe("install", () => {
  it("stores only the offline page", async () => {
    let done: Promise<unknown> = Promise.resolve();
    sw.listeners.install({ waitUntil: (p: Promise<unknown>) => (done = p) });
    await done;
    expect(sw.added).toEqual(["/offline.html"]);
    expect(sw.self.skipWaiting).toHaveBeenCalled();
  });
});

describe("activate", () => {
  it("deletes older offline caches but leaves other caches alone", async () => {
    let done: Promise<unknown> = Promise.resolve();
    sw.listeners.activate({ waitUntil: (p: Promise<unknown>) => (done = p) });
    await done;
    expect(sw.deleted).toEqual(["kakinotes-offline-v0"]);
    expect(sw.self.clients.claim).toHaveBeenCalled();
  });
});

describe("fetch", () => {
  it("shows the offline page when the network is down", async () => {
    sw.fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const f = fetchEvent({ mode: "navigate" });
    sw.listeners.fetch(f.event);
    expect(await (await f.responded!).text()).toBe(OFFLINE_BODY);
  });

  it.each([502, 503, 504, 520, 523, 530])(
    "shows the offline page for a %i from Cloudflare (Mac or Tunnel down)",
    async (status) => {
      sw.fetchMock.mockResolvedValue(new Response("cf error", { status }));
      const f = fetchEvent({ mode: "navigate" });
      sw.listeners.fetch(f.event);
      expect(await (await f.responded!).text()).toBe(OFFLINE_BODY);
    },
  );

  it.each([200, 404, 500])(
    "passes a %i page through untouched",
    async (status) => {
      const real = new Response("real page", { status });
      sw.fetchMock.mockResolvedValue(real);
      const f = fetchEvent({ mode: "navigate" });
      sw.listeners.fetch(f.event);
      expect(await f.responded).toBe(real);
    },
  );

  it("uses the navigation-preload response when there is one", async () => {
    const preload = new Response("preloaded", { status: 200 });
    const f = fetchEvent({ mode: "navigate", preload });
    sw.listeners.fetch(f.event);
    expect(await f.responded).toBe(preload);
    expect(sw.fetchMock).not.toHaveBeenCalled();
  });

  it.each(["cors", "no-cors", "same-origin"])(
    "never touches a %s request (data, images, /media)",
    (mode) => {
      const f = fetchEvent({ mode });
      sw.listeners.fetch(f.event);
      expect(f.responded).toBeUndefined();
    },
  );

  it("never touches a POST page load (form submission)", () => {
    const f = fetchEvent({ mode: "navigate", method: "POST" });
    sw.listeners.fetch(f.event);
    expect(f.responded).toBeUndefined();
  });

  it("never writes a page into the cache", async () => {
    sw.fetchMock.mockResolvedValue(new Response("story", { status: 200 }));
    const f = fetchEvent({ mode: "navigate" });
    sw.listeners.fetch(f.event);
    await f.responded;
    // install's addAll is the only write path; fetch must not open a cache.
    expect(sw.caches.open).not.toHaveBeenCalled();
    expect(source).not.toMatch(/\.put\(/);
  });
});
