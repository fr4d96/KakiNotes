import { describe, expect, it } from "vitest";
import { shareOriginFromHeaders } from "./share-origin";

const h = (entries: Record<string, string>) => new Headers(entries);

describe("shareOriginFromHeaders", () => {
  it("uses the host the request was served on, not the env fallback", () => {
    expect(
      shareOriginFromHeaders(
        h({ host: "kakinotes.vercel.app", "x-forwarded-proto": "https" }),
        "https://kakinotes-c2en8qt0k-old.vercel.app/",
      ),
    ).toBe("https://kakinotes.vercel.app");
  });

  it("prefers x-forwarded-host and takes the first of a list", () => {
    expect(
      shareOriginFromHeaders(
        h({
          host: "internal:3000",
          "x-forwarded-host": "kakinotes.vercel.app, proxy.local",
          "x-forwarded-proto": "https, http",
        }),
      ),
    ).toBe("https://kakinotes.vercel.app");
  });

  it("defaults to http on localhost and https elsewhere", () => {
    expect(shareOriginFromHeaders(h({ host: "localhost:3102" }))).toBe(
      "http://localhost:3102",
    );
    expect(shareOriginFromHeaders(h({ host: "kakinotes.vercel.app" }))).toBe(
      "https://kakinotes.vercel.app",
    );
  });

  it("ignores a proto that is not http or https", () => {
    expect(
      shareOriginFromHeaders(
        h({ host: "kakinotes.vercel.app", "x-forwarded-proto": "javascript" }),
      ),
    ).toBe("https://kakinotes.vercel.app");
  });

  it("falls back to the env origin, without a trailing slash, when there is no host", () => {
    expect(shareOriginFromHeaders(h({}), "https://example.test/")).toBe(
      "https://example.test",
    );
  });
});
