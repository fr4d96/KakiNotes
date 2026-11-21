/**
 * Per-tab memory for the phone bottom tab bar, like a native iOS tab bar:
 * each tab keeps the last in-app location you visited while it was active
 * (pathname + search) and that page's scroll position, so switching away and
 * back returns you to the story you were reading.
 *
 * Kept in sessionStorage -- per browser tab, gone when the app is closed, on
 * purpose. Only an in-app path/search and a scroll number are ever stored
 * (never an absolute URL, never anything personal). Every storage access is
 * wrapped, because private mode and locked-down WebViews throw.
 *
 * Two keys: locations (what the tab links read, exposed as an external store)
 * and scroll offsets (written on every scroll save, so deliberately kept out
 * of the store to avoid re-rendering the bar while scrolling).
 */

const LOCATIONS_KEY = "kakinotes:tab-locations";
const SCROLL_KEY = "kakinotes:tab-scroll";
const MAX_HREF_LENGTH = 2048;

const listeners = new Set<() => void>();

/** True for a same-origin, in-app path (plus optional search). */
export function isTrackableHref(href: unknown): href is string {
  if (typeof href !== "string") return false;
  if (href.length === 0 || href.length > MAX_HREF_LENGTH) return false;
  if (!href.startsWith("/") || href.startsWith("//")) return false;
  // Backslashes and control characters are parsed as something else by browsers.
  if (/[\\\u0000-\u001f\u007f]/.test(href)) return false;
  try {
    const base = "http://tab-memory.invalid";
    return new URL(href, base).origin === base;
  } catch {
    return false;
  }
}

function readJson(key: string): Record<string, unknown> {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function writeJson(key: string, value: Record<string, unknown>) {
  try {
    if (Object.keys(value).length === 0) {
      window.sessionStorage.removeItem(key);
    } else {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    }
  } catch {
    // Private mode / quota: the tab bar just falls back to the tab roots.
  }
}

function emit() {
  for (const listener of listeners) listener();
}

/** useSyncExternalStore subscription: fires when remembered locations change. */
export function subscribeTabMemory(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Raw snapshot (a string, so it compares by value); "" on the server. */
export function getTabMemorySnapshot(): string {
  try {
    return window.sessionStorage.getItem(LOCATIONS_KEY) ?? "";
  } catch {
    return "";
  }
}

export function getTabMemoryServerSnapshot(): string {
  return "";
}

/** Remembered location per tab root, from a snapshot. Invalid entries drop. */
export function parseTabMemory(snapshot: string): Record<string, string> {
  if (!snapshot) return {};
  try {
    const parsed: unknown = JSON.parse(snapshot);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const out: Record<string, string> = {};
    for (const [root, href] of Object.entries(parsed)) {
      if (isTrackableHref(root) && isTrackableHref(href)) out[root] = href;
    }
    return out;
  } catch {
    return {};
  }
}

/** The remembered location and scroll offset for a tab, or null. */
export function recallTab(
  root: string,
): { href: string; scroll: number } | null {
  const href = readJson(LOCATIONS_KEY)[root];
  if (!isTrackableHref(href)) return null;
  const y = readJson(SCROLL_KEY)[root];
  const scroll =
    typeof y === "number" && Number.isFinite(y) && y > 0 ? Math.round(y) : 0;
  return { href, scroll };
}

/**
 * Records the tab's current location. A different location resets its scroll
 * to the top (a new page starts at the top); the same one keeps it, so a
 * restore in progress is not wiped.
 */
export function rememberLocation(root: string, href: string) {
  if (!isTrackableHref(root) || !isTrackableHref(href)) return;
  const locations = readJson(LOCATIONS_KEY);
  if (locations[root] === href) return;
  writeJson(LOCATIONS_KEY, { ...locations, [root]: href });
  const scroll = readJson(SCROLL_KEY);
  if (root in scroll) {
    const { [root]: _dropped, ...rest } = scroll;
    void _dropped;
    writeJson(SCROLL_KEY, rest);
  }
  emit();
}

/** Updates the tab's scroll offset (no re-render: it is not in the store). */
export function saveTabScroll(root: string, scrollY: number) {
  if (!isTrackableHref(root) || !Number.isFinite(scrollY)) return;
  const y = Math.max(0, Math.round(scrollY));
  const scroll = readJson(SCROLL_KEY);
  if (scroll[root] === y || (y === 0 && !(root in scroll))) return;
  writeJson(SCROLL_KEY, { ...scroll, [root]: y });
}

/** Forget one tab (tapping the active tab pops it to its root). */
export function forgetTab(root: string) {
  const locations = readJson(LOCATIONS_KEY);
  const scroll = readJson(SCROLL_KEY);
  const had = root in locations;
  if (had) {
    const { [root]: _l, ...rest } = locations;
    void _l;
    writeJson(LOCATIONS_KEY, rest);
  }
  if (root in scroll) {
    const { [root]: _s, ...rest } = scroll;
    void _s;
    writeJson(SCROLL_KEY, rest);
  }
  if (had) emit();
}

/** Forget every tab (the viewer signed out). */
export function clearTabMemory() {
  const had = getTabMemorySnapshot() !== "";
  try {
    window.sessionStorage.removeItem(LOCATIONS_KEY);
    window.sessionStorage.removeItem(SCROLL_KEY);
  } catch {
    // Nothing stored that we could clear.
  }
  if (had) emit();
}
