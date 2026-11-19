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
  return error instanceof TypeError;
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
