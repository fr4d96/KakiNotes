/**
 * Which screens get the app's shared chrome -- the one header and the one
 * phone tab bar that app/layout.tsx draws for the whole app (2026-11-18),
 * so they stay mounted when a tap crosses route groups (Home/Stories/Profile
 * are (public), Folders/My Stories are (contributor)). Before, each group's
 * layout drew its own copy, and crossing groups blanked both.
 *
 * Path rules only, for drawing: nothing here decides access (proxy.ts, the
 * route groups' layouts and RLS do).
 */

/** True when `pathname` is `base` or anything beneath it. */
export function isWithin(pathname: string | null, base: string): boolean {
  return pathname === base || !!pathname?.startsWith(`${base}/`);
}

/**
 * The (contributor) route group: the signed-in contributor's own area.
 * The public reader routes (/stories, /stories/<slug>) are deliberately
 * absent. Its layout's guard has proven a session for every one of these,
 * so the chrome can start signed in there.
 */
export function isContributorArea(pathname: string | null): boolean {
  if (!pathname) return false;
  return (
    isWithin(pathname, "/my-stories") ||
    isWithin(pathname, "/my-photos") ||
    isWithin(pathname, "/account") ||
    isWithin(pathname, "/notifications") ||
    isWithin(pathname, "/affirmations") ||
    isWithin(pathname, "/stories/new") ||
    /^\/stories\/[^/]+\/(edit|preview)(\/|$)/.test(pathname)
  );
}

/** Staff tools have their own header (components/staff-nav.tsx). */
const STAFF = ["/moderation", "/editorial", "/admin", "/readiness"];
/** Dev and QA pages: no app chrome. */
const TOOLING = ["/dev", "/qa-index"];

/** The shared header: everywhere but staff, the private note pages and tooling. */
export function showsAppHeader(pathname: string | null): boolean {
  if (!pathname) return true;
  return ![...STAFF, "/notes", ...TOOLING].some((base) =>
    isWithin(pathname, base),
  );
}

/** The phone tab bar: like the header, and not on the Drive-connect step. */
export function showsTabBar(pathname: string | null): boolean {
  if (!pathname) return true;
  return ![...STAFF, "/notes", "/connect-drive", ...TOOLING].some((base) =>
    isWithin(pathname, base),
  );
}
