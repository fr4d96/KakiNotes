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

export function pageTitleKey(pathname: string | null): string | null {
  if (!pathname) return null;
  const prefix = countryUrlPrefix(countryFromPathname(pathname));
  const path = pathname.slice(prefix.length).replace(/\/+$/, "") || "/";
  return PAGE_TITLE_KEYS[path] ?? null;
}
