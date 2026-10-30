import { countryFromPathname, countryUrlPrefix } from "@/lib/story/countries";

/**
 * Which pages show their own title in the top bar on phones (iOS
 * navigation-bar style), keyed by path with any country prefix (/cn)
 * removed. The value is the SAME message key the page's <h1> renders, so the
 * bar and the (phone-hidden) heading can never say different things.
 *
 * Only "label" pages belong here -- pages whose heading names a place in the
 * app. Pages whose heading IS the content keep the Kakinotes wordmark and
 * their big in-page title: the landing page, a story, a contributor profile,
 * the story editor and preview. /reset-password is left out too: its
 * heading switches to "This link has expired", which is the message itself.
 *
 * Read by components/header-brand.tsx. A page listed here must give its
 * <h1> `max-md:sr-only` so the title is not drawn twice on a phone.
 */
const PAGE_TITLE_KEYS: Record<string, string> = {
  "/stories": "stories.title",
  "/contributors": "contributors.title",
  "/costs": "costs.title",
  "/about": "about.title",
  "/privacy": "legal.privacyTitle",
  "/terms": "legal.termsTitle",
  "/community-guidelines": "legal.guidelinesTitle",
  "/copyright": "legal.copyrightTitle",
  "/sign-in": "auth.signIn.title",
  "/sign-up": "auth.signUp.title",
  "/forgot-password": "auth.forgotPassword.title",
  "/my-stories": "myStories.title",
  "/my-stories/map": "storyFolders.title",
  "/my-stories/journey": "myJourney.title",
  "/my-photos": "myPhotos.title",
  "/notifications": "notifications.title",
  "/account": "account.title",
  "/stories/new": "newStory.title",
  "/stories/new/import": "pdfImport.title",
};

/**
 * Sub-pages: where their top-left back arrow goes, and the message key that
 * names that place (for the arrow's accessible name, "Back to My Stories").
 * Replaces the "Back to …" text links these pages used to carry. On phones
 * the arrow sits in the top bar before the title (components/header-brand.tsx);
 * from md up, beside the page's own heading (components/back-link.tsx).
 */
const PAGE_BACK: Record<string, { href: string; labelKey: string }> = {
  "/my-stories/map": { href: "/my-stories", labelKey: "myStories.title" },
  "/my-photos": { href: "/my-stories", labelKey: "myStories.title" },
  "/stories/new": { href: "/my-stories", labelKey: "myStories.title" },
  "/stories/new/import": { href: "/stories/new", labelKey: "nav.newStory" },
  "/forgot-password": { href: "/sign-in", labelKey: "auth.signIn.title" },
};

function splitPath(pathname: string) {
  const prefix = countryUrlPrefix(countryFromPathname(pathname));
  const path = pathname.slice(prefix.length).replace(/\/+$/, "") || "/";
  return { prefix, path };
}

export function pageTitleKey(pathname: string | null): string | null {
  if (!pathname) return null;
  return PAGE_TITLE_KEYS[splitPath(pathname).path] ?? null;
}

export type PageBack = {
  /** Where the arrow goes -- or, for a `history` page, the fallback. */
  href: string;
  /** Names `href` in the arrow's label ("Back to My Stories"). */
  labelKey: string;
  /**
   * A story can be opened from anywhere (My Stories, the Stories list, a
   * profile, a folder), so its arrow goes back to wherever the reader came
   * from, and uses `href` only when they landed on it directly. Its label is
   * a plain "Back", and the arrow shows at every width: these pages have
   * no in-page heading row to sit beside.
   */
  history?: boolean;
};

/** A story's own pages: /stories/<id>/edit, /preview, and /stories/<slug>. */
function storyBack(path: string): PageBack | null {
  const m = /^\/stories\/([^/]+)(?:\/(edit|preview))?$/.exec(path);
  if (!m || m[1] === "new") return null;
  return m[2]
    ? { href: "/my-stories", labelKey: "myStories.title", history: true }
    : { href: "/stories", labelKey: "stories.title", history: true };
}

/** The back target for a sub-page, keeping the reader's country prefix. */
export function pageBack(pathname: string | null): PageBack | null {
  if (!pathname) return null;
  const { prefix, path } = splitPath(pathname);
  const back = PAGE_BACK[path] ?? storyBack(path);
  return back ? { ...back, href: `${prefix}${back.href}` } : null;
}
