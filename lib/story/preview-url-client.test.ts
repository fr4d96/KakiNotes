import { beforeEach, describe, expect, it, vi } from "vitest";

const mintPreviewUrlsAction = vi.fn();

vi.mock("@/app/(contributor)/stories/[id]/media-actions", () => ({
  mintPreviewUrlsAction: (...args: unknown[]) =>
    mintPreviewUrlsAction(...(args as [string[]])),
}));

const { getPreviewUrl, resetPreviewUrlCacheForTests } =
  await import("./preview-url-client");

const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";
const ID_C = "33333333-3333-4333-8333-333333333333";

describe("preview-url-client", () => {
  beforeEach(() => {
    mintPreviewUrlsAction.mockReset();
    resetPreviewUrlCacheForTests();
  });

  it("coalesces same-tick calls into a single batched action call", async () => {
    mintPreviewUrlsAction.mockResolvedValueOnce({
      [ID_A]: { url: "url-a" },
      [ID_B]: { url: "url-b" },
      [ID_C]: { url: "url-c" },
    });

    const [a, b, c] = await Promise.all([
      getPreviewUrl(ID_A),
      getPreviewUrl(ID_B),
      getPreviewUrl(ID_C),
    ]);

    expect(mintPreviewUrlsAction).toHaveBeenCalledTimes(1);
    expect(mintPreviewUrlsAction).toHaveBeenCalledWith([ID_A, ID_B, ID_C]);
    expect(a).toEqual({ url: "url-a" });
    expect(b).toEqual({ url: "url-b" });
    expect(c).toEqual({ url: "url-c" });
  });

  it("dedupes a call for an id already in flight", async () => {
    let resolveAction!: (value: unknown) => void;
    mintPreviewUrlsAction.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveAction = resolve;
      }),
    );

    const first = getPreviewUrl(ID_A);
    // Let the microtask queue flush the batch so ID_A is in flight.
    await Promise.resolve();
    await Promise.resolve();
    const second = getPreviewUrl(ID_A);

    resolveAction({ [ID_A]: { url: "url-a" } });

    const [a, b] = await Promise.all([first, second]);
    expect(mintPreviewUrlsAction).toHaveBeenCalledTimes(1);
    expect(a).toEqual({ url: "url-a" });
    expect(b).toEqual({ url: "url-a" });
  });

  it("caches a success for 90s then re-fetches after it expires", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(0);
      mintPreviewUrlsAction.mockResolvedValueOnce({
        [ID_A]: { url: "url-a" },
      });

      const first = getPreviewUrl(ID_A);
      await vi.advanceTimersByTimeAsync(0);
      expect(await first).toEqual({ url: "url-a" });
      expect(mintPreviewUrlsAction).toHaveBeenCalledTimes(1);

      // Still within the 90s window: served from cache, no new call.
      vi.setSystemTime(89_000);
      expect(await getPreviewUrl(ID_A)).toEqual({ url: "url-a" });
      expect(mintPreviewUrlsAction).toHaveBeenCalledTimes(1);

      // Past the 90s window: a fresh action call happens.
      vi.setSystemTime(91_000);
      mintPreviewUrlsAction.mockResolvedValueOnce({
        [ID_A]: { url: "url-a-2" },
      });
      const second = getPreviewUrl(ID_A);
      await vi.advanceTimersByTimeAsync(0);
      expect(await second).toEqual({ url: "url-a-2" });
      expect(mintPreviewUrlsAction).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not cache a per-id error entry", async () => {
    mintPreviewUrlsAction.mockResolvedValueOnce({
      [ID_A]: { error: "authorize failed" },
    });

    const first = await getPreviewUrl(ID_A);
    expect(first).toEqual({ error: "authorize failed" });
    expect(mintPreviewUrlsAction).toHaveBeenCalledTimes(1);

    mintPreviewUrlsAction.mockResolvedValueOnce({
      [ID_A]: { url: "url-a" },
    });
    const second = await getPreviewUrl(ID_A);
    expect(second).toEqual({ url: "url-a" });
    expect(mintPreviewUrlsAction).toHaveBeenCalledTimes(2);
  });

  it("resolves every queued id to a top-level error response", async () => {
    mintPreviewUrlsAction.mockResolvedValueOnce({
      error: "You must be signed in.",
    });

    const [a, b] = await Promise.all([
      getPreviewUrl(ID_A),
      getPreviewUrl(ID_B),
    ]);
    expect(a).toEqual({ error: "You must be signed in." });
    expect(b).toEqual({ error: "You must be signed in." });
    expect(mintPreviewUrlsAction).toHaveBeenCalledTimes(1);
  });

  it("resolves every queued id to an error object if the action rejects", async () => {
    mintPreviewUrlsAction.mockRejectedValueOnce(new Error("network down"));

    const [a, b] = await Promise.all([
      getPreviewUrl(ID_A),
      getPreviewUrl(ID_B),
    ]);
    expect(a).toEqual({ error: "network down" });
    expect(b).toEqual({ error: "network down" });
  });
});
