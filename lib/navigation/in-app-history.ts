/**
 * Whether the reader has moved between pages inside this tab of the app,
 * so a back arrow can safely call history.back(). Counted by
 * components/in-app-history.tsx (mounted once, in the root layout) and read
 * by components/back-link.tsx. A reader who landed on a story from a shared
 * link has nothing to go back to here -- history.back() would leave the site
 * -- so their arrow follows its fallback link instead.
 *
 * It also remembers the page before the current one, for the Report a bug
 * dialog: opened from Settings, the bug is almost always about the page the
 * reader just came from, not Settings itself.
 */
let navigations = 0;
let currentPath: string | null = null;
let previousPath: string | null = null;

export function noteInAppNavigation(pathname?: string) {
  navigations += 1;
  if (pathname !== undefined) notePathname(pathname);
}

/** Records the pathname now showing; the one before it becomes "previous". */
export function notePathname(pathname: string) {
  if (pathname === currentPath) return;
  previousPath = currentPath;
  currentPath = pathname;
}

export function canGoBackInApp(): boolean {
  return navigations > 0;
}

/** The pathname shown before the current one in this tab, if any. */
export function previousInAppPath(): string | null {
  return previousPath;
}
