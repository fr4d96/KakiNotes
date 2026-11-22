// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  backoffDelayMs,
  retryOnNetworkError,
  isNetworkError,
} from "@/lib/story/wait-for-resume";

describe("backoffDelayMs", () => {
  it("doubles from 1s and caps at 30s", () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(backoffDelayMs)).toEqual([
      1000, 2000, 4000, 8000, 16000, 30000, 30000,
    ]);
  });
});

describe("retryOnNetworkError", () => {
  it("retries after a network rejection, toggling pause", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Load failed"))
      .mockResolvedValueOnce("ok");
    const wait = vi.fn().mockResolvedValue(undefined);
    const onPause = vi.fn();
    await expect(retryOnNetworkError(fn, { wait, onPause })).resolves.toBe(
      "ok",
    );
    expect(wait).toHaveBeenCalledWith(1);
    expect(onPause.mock.calls).toEqual([[true], [false]]);
  });

  it("never retries a returned { error } result", async () => {
    const fn = vi.fn().mockResolvedValue({ error: "nope" });
    const wait = vi.fn();
    await expect(retryOnNetworkError(fn, { wait })).resolves.toEqual({
      error: "nope",
    });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });

  it("propagates non-network errors immediately", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("server blew up"));
    const wait = vi.fn();
    await expect(retryOnNetworkError(fn, { wait })).rejects.toThrow(
      "server blew up",
    );
    expect(wait).not.toHaveBeenCalled();
  });

  it("gives up after maxAttempts consecutive network failures", async () => {
    const fn = vi.fn().mockRejectedValue(new TypeError("Load failed"));
    const wait = vi.fn().mockResolvedValue(undefined);
    const onPause = vi.fn();
    await expect(
      retryOnNetworkError(fn, { wait, onPause, maxAttempts: 3 }),
    ).rejects.toBeInstanceOf(TypeError);
    expect(fn).toHaveBeenCalledTimes(3);
    expect(onPause).toHaveBeenLastCalledWith(false);
  });

  it("isNetworkError recognises TypeError and AbortError only", () => {
    expect(isNetworkError(new TypeError("x"))).toBe(true);
    expect(
      isNetworkError(Object.assign(new Error("x"), { name: "AbortError" })),
    ).toBe(true);
    expect(isNetworkError(new Error("x"))).toBe(false);
  });
});
