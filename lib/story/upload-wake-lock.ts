/**
 * Keeps the phone's screen on while photos are uploading.
 *
 * The resume logic in wait-for-resume.ts recovers after iOS freezes the page,
 * but the best fix is not freezing at all: the Screen Wake Lock API stops the
 * screen dimming and locking while a lock is held (iOS 16.4+ in Safari, and
 * in home-screen apps since iOS 18.4). Where it is missing or refused, this
 * quietly does nothing and the resume path still covers the upload.
 *
 * Reference-counted: overlapping batches share one lock, released when the
 * last one finishes. The browser drops a wake lock whenever the page is
 * hidden, so it is taken again when the page becomes visible while uploads
 * are still running.
 */

type Sentinel = { release: () => Promise<void> };
type WakeLockApi = { request: (type: "screen") => Promise<Sentinel> };

let holders = 0;
let sentinel: Sentinel | null = null;
let listening = false;
// A request in flight, so two batches starting together ask only once.
let requesting = false;

function api(): WakeLockApi | null {
  if (typeof navigator === "undefined") return null;
  return (navigator as Navigator & { wakeLock?: WakeLockApi }).wakeLock ?? null;
}

async function acquire() {
  const wakeLock = api();
  if (!wakeLock || sentinel || requesting || holders === 0) return;
  if (typeof document !== "undefined" && document.visibilityState !== "visible")
    return;
  requesting = true;
  try {
    const next = await wakeLock.request("screen");
    // Every upload may have finished while the request was pending.
    if (holders === 0) {
      void next.release().catch(() => {});
      return;
    }
    sentinel = next;
  } catch {
    // Refused (low battery mode, no user activation, not supported here).
  } finally {
    requesting = false;
  }
}

function onVisibilityChange() {
  if (document.visibilityState === "visible") {
    // The old sentinel was released by the browser when the page hid.
    sentinel = null;
    void acquire();
  }
}

/** Hold the screen awake until the returned function is called. */
export function holdScreenAwake(): () => void {
  if (!api()) return () => {};
  holders += 1;
  if (!listening && typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibilityChange);
    listening = true;
  }
  void acquire();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders = Math.max(0, holders - 1);
    if (holders > 0) return;
    if (listening) {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      listening = false;
    }
    const current = sentinel;
    sentinel = null;
    void current?.release().catch(() => {});
  };
}
