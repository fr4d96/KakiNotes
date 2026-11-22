/**
 * Shared "wait until the page is back" helper for the photo upload path.
 *
 * iOS freezes a home-screen PWA when the screen locks; fetches in flight
 * then reject with a network error (TypeError "Load failed"). Rather than
 * calling that a failed upload, callers wait here until the page is visible
 * and online again (plus an exponential backoff), then retry.
 *
 * Browser-only, no "server-only" guard. Everything environment-specific is
 * injectable so tests need neither a DOM nor real timers.
 */

export const RESUME_BACKOFF_BASE_MS = 1000;
export const RESUME_BACKOFF_CAP_MS = 30_000;
/** Consecutive failures (without progress) tolerated before giving up. */
export const MAX_RESUME_ATTEMPTS = 8;

/** attempt is 1-based: 1s, 2s, 4s, ... capped at 30s. */
export function backoffDelayMs(attempt: number): number {
  const exp = Math.max(0, attempt - 1);
  return Math.min(RESUME_BACKOFF_CAP_MS, RESUME_BACKOFF_BASE_MS * 2 ** exp);
}

export type WaitForResume = (attempt: number) => Promise<void>;

/** Network-level rejection from fetch / a server action (not an HTTP status
 * and not a returned `{ error }`). fetch rejects with TypeError. */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  // Our own abortOnResume() cancelling a request the freeze left hanging.
  return error instanceof Error && error.name === "AbortError";
}

/**
 * A signal that aborts a request if the page was hidden while it ran and has
 * just become visible again. iOS sometimes leaves a fetch that spanned a
 * screen lock hanging forever instead of rejecting it, which kept the tile
 * spinning; aborting turns that into a network error the retry path above
 * already handles. A request that actually finished meanwhile is safe to
 * repeat: callers check what the server already has before re-sending.
 */
export function abortOnResume(): { signal?: AbortSignal; done: () => void } {
  if (typeof document === "undefined" || typeof AbortController === "undefined")
    return { done: () => {} };
  const controller = new AbortController();
  let wasHidden = document.visibilityState !== "visible";
  const onChange = () => {
    if (document.visibilityState !== "visible") {
      wasHidden = true;
    } else if (wasHidden) {
      controller.abort();
    }
  };
  document.addEventListener("visibilitychange", onChange);
  return {
    signal: controller.signal,
    done: () => document.removeEventListener("visibilitychange", onChange),
  };
}

function isReady(): boolean {
  if (typeof document !== "undefined" && document.visibilityState !== "visible")
    return false;
  if (typeof navigator !== "undefined" && navigator.onLine === false)
    return false;
  return true;
}

/**
 * Default waiter: resolves once the page is visible AND online, then after
 * the attempt's backoff. Re-checks if the page is hidden again during the
 * backoff.
 */
export const waitForResume: WaitForResume = async (attempt) => {
  if (typeof window === "undefined") {
    await new Promise((r) => setTimeout(r, backoffDelayMs(attempt)));
    return;
  }
  for (;;) {
    if (!isReady()) {
      await new Promise<void>((resolve) => {
        const check = () => {
          if (!isReady()) return;
          document.removeEventListener("visibilitychange", check);
          window.removeEventListener("online", check);
          resolve();
        };
        document.addEventListener("visibilitychange", check);
        window.addEventListener("online", check);
      });
    }
    await new Promise((r) => setTimeout(r, backoffDelayMs(attempt)));
    if (isReady()) return;
  }
};

/**
 * Runs `fn`; if it REJECTS with a network error, pauses (onPause(true)),
 * waits to resume, and retries, up to `maxAttempts` consecutive failures.
 * A returned value (including a `{ error }` result) is never retried, and a
 * non-network throw propagates immediately.
 */
export async function retryOnNetworkError<T>(
  fn: () => Promise<T>,
  options: {
    wait?: WaitForResume;
    onPause?: (paused: boolean) => void;
    maxAttempts?: number;
  } = {},
): Promise<T> {
  const wait = options.wait ?? waitForResume;
  const max = options.maxAttempts ?? MAX_RESUME_ATTEMPTS;
  let failures = 0;
  for (;;) {
    try {
      const result = await fn();
      if (failures > 0) options.onPause?.(false);
      return result;
    } catch (error) {
      if (!isNetworkError(error)) {
        if (failures > 0) options.onPause?.(false);
        throw error;
      }
      failures += 1;
      if (failures >= max) {
        options.onPause?.(false);
        throw error;
      }
      options.onPause?.(true);
      await wait(failures);
    }
  }
}
