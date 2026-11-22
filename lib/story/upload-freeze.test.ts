// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { abortOnResume } from "@/lib/story/wait-for-resume";

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

afterEach(() => {
  setVisibility("visible");
  vi.resetModules();
  delete (navigator as { wakeLock?: unknown }).wakeLock;
});

describe("abortOnResume", () => {
  it("aborts a request that spanned the page being hidden", () => {
    const guard = abortOnResume();
    expect(guard.signal?.aborted).toBe(false);
    setVisibility("hidden");
    expect(guard.signal?.aborted).toBe(false);
    setVisibility("visible");
    expect(guard.signal?.aborted).toBe(true);
    guard.done();
  });

  it("leaves a request alone once it is done", () => {
    const guard = abortOnResume();
    guard.done();
    setVisibility("hidden");
    setVisibility("visible");
    expect(guard.signal?.aborted).toBe(false);
  });
});

describe("holdScreenAwake", () => {
  function fakeWakeLock() {
    const release = vi.fn(async () => {});
    const request = vi.fn(async () => ({ release }));
    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: { request },
    });
    return { request, release };
  }

  it("holds one lock across overlapping batches and frees it after the last", async () => {
    const { request, release } = fakeWakeLock();
    const { holdScreenAwake } = await import("@/lib/story/upload-wake-lock");
    const a = holdScreenAwake();
    const b = holdScreenAwake();
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    a();
    expect(release).not.toHaveBeenCalled();
    b();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("takes the lock again when the page comes back mid-upload", async () => {
    const { request } = fakeWakeLock();
    const { holdScreenAwake } = await import("@/lib/story/upload-wake-lock");
    const done = holdScreenAwake();
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    setVisibility("hidden");
    setVisibility("visible");
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    done();
  });

  it("does nothing where the API is missing", async () => {
    const { holdScreenAwake } = await import("@/lib/story/upload-wake-lock");
    expect(() => holdScreenAwake()()).not.toThrow();
  });
});
