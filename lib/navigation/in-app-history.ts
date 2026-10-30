/**
 * Whether the reader has moved between pages inside this tab of the app,
 * so a back arrow can safely call history.back(). Counted by
 * components/in-app-history.tsx (mounted once, in the root layout) and read
 * by components/back-link.tsx. A reader who landed on a story from a shared
 * link has nothing to go back to here -- history.back() would leave the site
 * -- so their arrow follows its fallback link instead.
 */
let navigations = 0;

export function noteInAppNavigation() {
  navigations += 1;
}

export function canGoBackInApp(): boolean {
  return navigations > 0;
}
