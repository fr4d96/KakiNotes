import {
  countryFromPathname,
  countryUrlPrefix,
  type CountrySlug,
} from "@/lib/story/countries";

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
 * <h1> `max-md:sr-only` so the title is not drawn twice on a phone. Where
 * the full title is too long for the bar, BAR_TITLE_KEYS below gives the bar
 * a shorter label for the same place.
 */
const PAGE_TITLE_KEYS: Record<string, string> = {
  "/stories": "stories.title",
  "/contributors": "contributors.title",
  "/costs": "costs.title",
  "/about": "about.title",
  "/settings": "settings.title",
  "/privacy": "legal.privacyTitle",
  "/terms": "legal.termsTitle",
  "/community-guidelines": "legal.guidelinesTitle",
  "/copyright": "legal.copyrightTitle",
  "/sign-in": "auth.signIn.title",
  "/sign-up": "auth.signUp.title",
  "/forgot-password": "auth.forgotPassword.title",
  "/my-stories": "myStories.title",
  "/my-stories/map": "storyFolders.title",
  "/my-photos": "myPhotos.title",
  "/notifications": "notifications.title",
  "/affirmations": "affirmations.title",
  "/account": "account.title",
  "/stories/new": "newStory.title",
  "/stories/new/import": "pdfImport.title",
};

/**
 * Where a country's page heading differs from the shared one. "What a
 * working holiday cost" is New Zealand's -- a working holiday is a New
 * Zealand term -- so China's Costs page has its own title, and the bar must
 * say the same as that page's <h1>.
 */
const COUNTRY_PAGE_TITLE_KEYS: Partial<
  Record<CountrySlug, Record<string, string>>
> = {
  china: { "/costs": "countryContent.china.costsTitle" },
  malaysia: { "/costs": "countryContent.malaysia.costsTitle" },
};

/**
 * Shorter wording for the phone top bar, where a page's full heading does not
 * fit (2026-11-18 header audit). The bar leaves a title roughly 125px signed
 * out (Sign in + ☰ on the right) and 160px signed in (bell + avatar) on an
 * iPhone 17, at 20px black weight. "What a working holiday cost" needed 270px
 * and was cut to "What a worki…", so these say the same thing the way a tab
 * would. Keyed by the full-title key, so a page and its country variant
 * (China's Costs) share one short label.
 *
 * Only the BAR changes: the page's <h1> (sr-only on phones) keeps the full
 * title for screen readers, and wider screens still show it as the heading.
 * A title missing from this table is already short enough in every language.
 */
const BAR_TITLE_KEYS: Record<string, string> = {
  "costs.title": "barTitles.costs",
  "countryContent.china.costsTitle": "barTitles.costs",
  "countryContent.malaysia.costsTitle": "barTitles.costs",
  "about.title": "barTitles.about",
  "legal.guidelinesTitle": "barTitles.guidelines",
  "legal.copyrightTitle": "barTitles.copyright",
  "auth.signUp.title": "barTitles.signUp",
  "auth.forgotPassword.title": "barTitles.forgotPassword",
  "affirmations.title": "barTitles.affirmations",
  "newStory.title": "barTitles.newStory",
  "pdfImport.title": "barTitles.pdfImport",
};

/**
 * The sign-in screens. On a phone the top bar drops its own Sign in button
 * there: the page IS sign-in, and the button only took room from the title.
 */
const AUTH_PATHS = new Set([
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/reset-password",
]);

export function isAuthPage(pathname: string | null): boolean {
  if (!pathname) return false;
  return AUTH_PATHS.has(splitPath(pathname).path);
}

/**
 * Sub-pages: where their top-left back arrow goes, and the message key that
 * names that place (for the arrow's accessible name, "Back to My Stories").
 * Replaces the "Back to …" text links these pages used to carry. On phones
 * the arrow sits in the top bar before the title (components/header-brand.tsx);
 * from md up, beside the page's own heading (components/back-link.tsx).
 */
const PAGE_BACK: Record<string, { href: string; labelKey: string }> = {
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

/** One journey's page, /my-stories/journey/<main story id>. */
const JOURNEY_STORY = /^\/my-stories\/journey\/[^/]+$/;

export function pageTitleKey(pathname: string | null): string | null {
  if (!pathname) return null;
  const { path } = splitPath(pathname);
  // A journey's page keeps "Journey map" in the bar, under a back arrow;
  // its own heading (the journey's name) stays visible -- it is content,
  // not a repeat of the bar.
  if (JOURNEY_STORY.test(path)) return "myJourney.title";
  const countryKey =
    COUNTRY_PAGE_TITLE_KEYS[countryFromPathname(pathname)]?.[path];
  return countryKey ?? PAGE_TITLE_KEYS[path] ?? null;
}

/**
 * What the phone top bar shows for a page: its short bar label where the
 * full title would not fit (BAR_TITLE_KEYS), otherwise the page's own title.
 */
export function pageBarTitleKey(pathname: string | null): string | null {
  const key = pageTitleKey(pathname);
  return key ? (BAR_TITLE_KEYS[key] ?? key) : null;
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
  const back =
    PAGE_BACK[path] ??
    (JOURNEY_STORY.test(path)
      ? // Only ever opened from its folder's journey icon, so back is the
        // folders.
        { href: "/my-stories/map", labelKey: "storyFolders.title" }
      : storyBack(path));
  return back ? { ...back, href: `${prefix}${back.href}` } : null;
}
