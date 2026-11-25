"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { SettingsIcon } from "@/components/icons";
import { controlToneClasses } from "@/components/ui-tone";
import { useTranslations } from "next-intl";
import { HeaderBrand } from "@/components/header-brand";
import { MobileNavToggle } from "@/components/mobile-nav-toggle";
import { CountrySwitcher } from "@/components/country-switcher";
import { AuthModal } from "@/components/auth/auth-modal";
import { SignInForm } from "@/components/auth/sign-in-form";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { UserAvatarMenu } from "@/components/auth/user-avatar-menu";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { isReviewOnly } from "@/lib/auth/staff-menu";
import { useViewerIdentity } from "@/lib/auth/viewer-identity";
import { isAuthPage } from "@/lib/navigation/page-titles";
import { isContributorArea, showsAppHeader } from "@/lib/navigation/app-chrome";
import { ContributorNavLinks } from "@/components/contributor-nav-links";
import { countryUrlPrefix } from "@/lib/story/countries";
import { useCurrentCountry } from "@/lib/story/use-current-country";

// Every item links to a real browsing page, never to a section on the home
// page -- the old "Destinations" entry was a /#match anchor that did nothing
// useful from most routes. Labels are message keys under `nav`, resolved
// inside the component.
const primaryNav = [
  { href: "/stories", key: "stories" },
  { href: "/contributors", key: "contributors" },
  { href: "/about", key: "about" },
] as const;

type AuthModalKind = "sign-in" | "sign-up" | null;

/**
 * Shared across every public and auth route ((public)/layout.tsx AND
 * (auth)/layout.tsx both render this). The header is ALWAYS a solid themed
 * surface -- there is no transparent-over-hero state.
 *
 * There used to be one, gated on `pathname === "/" && !scrolled`, because
 * the home hero ran full-bleed and tucked itself behind the header with a
 * `-mt-[76px]`. That hero is now an inset plate that starts below the
 * header (see app/(public)/page.tsx), so there is no longer a photo for a
 * transparent header to sit over -- keeping the state would have drawn
 * white nav text straight onto the light page ground. Removing it also
 * removes a scroll listener from every public route and the `inverted`
 * prop threading that went with it.
 *
 * "Sign in" and "Share your story" open a modal (components/auth/auth-modal.tsx)
 * wrapping the same SignInForm/SignUpForm the real /sign-in and /sign-up
 * pages use -- no auth logic is duplicated. Those routes still exist and
 * work standalone (direct navigation, bookmarks, and the auth middleware's
 * own redirects all still land on a real page); this only changes what the
 * header's own buttons do. A successful sign-in still calls redirect() from
 * the server action as before, which navigates the whole page away and
 * closes the modal as a side effect -- closing it any other way (Escape,
 * backdrop click, the × button) just returns to whatever page was open
 * underneath.
 *
 * Session awareness: public pages deliberately never call getCurrentUser()
 * server-side (see (contributor)/layout.tsx's own comment) -- this header
 * is the one place that still needs to know if the visitor is signed in,
 * so it checks client-side only, via the browser Supabase client, through
 * the shared store in lib/auth/viewer-identity.ts. That keeps every public page's server-rendered
 * HTML identical for every visitor; only this already-client component
 * re-renders once the check resolves. (Public pages have rendered per
 * request since the language cookie, 2026-09-14, and cache their DATA
 * instead -- but "the HTML carries nothing per-person" is still the
 * property that lets that data be shared, and a server-side session read
 * here would break it.)
 *
 * Once signed in, NotificationBell renders beside the avatar (both
 * breakpoints) and does its own RPC reads the same client-side way, for
 * the same reason -- see that component.
 *
 * Once signed in, the avatar emoji and role come from the same tab-wide
 * store (lib/auth/viewer-identity.ts), which reads the caller's own rows
 * under RLS -- contributors.avatar_emoji first, profiles as the fallback,
 * exactly like the server-rendered ContributorNav -- to feed
 * components/auth/user-avatar-menu.tsx, which replaces the whole
 * My Stories/Account/New Story/Sign out button row with a single avatar
 * that opens those same four actions in a dropdown.
 *
 * That dropdown is the ONLY place My Stories / New Story appear on public
 * pages -- ContributorNavLinks (the always-visible header versions) is
 * rendered by ContributorNav alone, on the (contributor) routes where the
 * visitor is actually authoring. A signed-in visitor browsing public pages
 * is reading, so the public nav bar stays Stories/Destinations/About.
 */
export function SiteHeader() {
  const t = useTranslations("nav");
  // The page's country, or the remembered one on pages outside both
  // countries (sign-in, onboarding), so the nav links stay in it.
  const countryPrefix = countryUrlPrefix(useCurrentCountry());
  const [authModal, setAuthModal] = useState<AuthModalKind>(null);
  // Who is looking, from the tab-wide store (lib/auth/viewer-identity.ts):
  // survives this header remounting when a tab moves between the public and
  // contributor layouts, and reads the avatar the same way the server does.
  // The role drives ONLY which staff links the dropdown draws -- never
  // access (lib/auth/staff-menu.ts; proxy.ts re-derives it server-side).
  const viewer = useViewerIdentity();
  const pathname = usePathname();
  // A contributor route has already proven a session on the server, so it
  // paints signed in before the browser's own check answers.
  const inContributorArea = isContributorArea(pathname);
  const signedIn =
    viewer.status === "signed-in" ||
    (viewer.status === "unknown" && inContributorArea);
  const avatarEmoji = viewer.avatarEmoji;
  const role = viewer.role;
  // On the sign-in screens the page itself is sign-in: the phone bar drops
  // its own Sign in button there and gives the room to the title.
  const onAuthPage = isAuthPage(pathname);

  // shadow-sm resolves to the themed elevation ramp: a soft lift in light,
  // where the bar shares --background with the page and a hairline alone
  // barely separates it, and near-nothing in dark, where it already does.
  const headerToneClasses =
    "journiq-header-solid border-b border-border-subtle text-foreground shadow-sm";
  const signInToneClasses = "border-border-subtle";
  const navItems = primaryNav.map((item) => ({
    href: `${countryPrefix}${item.href}`,
    label: t(item.key),
  }));
  // On phones Stories and Contributors live in the bottom tab bar
  // (components/bottom-tab-bar.tsx), so the hamburger / avatar menu only
  // carries what the bar doesn't.
  const mobileNavItems = primaryNav.flatMap((item) =>
    item.key === "about"
      ? [{ href: `${countryPrefix}${item.href}`, label: t(item.key) }]
      : [],
  );

  if (!showsAppHeader(pathname)) return null;

  return (
    // The env() paddings keep the bar clear of the notch / status bar and
    // the side cut-outs now that app/layout.tsx's viewport uses
    // viewportFit: "cover" (they are 0 in an ordinary browser tab).
    <header
      // Read by the story editor's sticky toolbar
      // (components/story/editor/sticky-toolbar.ts) to stick beneath it.
      data-sticky-chrome=""
      className={`sticky top-0 z-40 pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)] transition-colors ${headerToneClasses}`}
    >
      <div className="mx-auto flex min-h-[76px] max-w-[1440px] items-center gap-3 px-4 sm:gap-5 sm:px-6">
        <HeaderBrand homeHref={countryPrefix || "/"} priority />
        {/* Beside the logo from md up: the current country's flag. On
            phones a signed-in visitor gets it at the right of the bar,
            beside the bell (below); signed out, the country is chosen on
            Settings → Country, leaving the bar to the title and Sign in. */}
        <div className="hidden md:contents">
          <CountrySwitcher />
        </div>

        <nav
          aria-label={t("primary")}
          className="ml-auto hidden items-center gap-6 text-sm font-bold md:flex"
        >
          {/* In the contributor's own area the desktop links are theirs
              (My Stories, New Story), as ContributorNav's were before this
              one header served every route group. */}
          {inContributorArea && !isReviewOnly(role) ? (
            <ContributorNavLinks className="flex" />
          ) : (
            <div className="flex items-center gap-6">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="journiq-nav-link"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            {signedIn ? (
              <>
                <NotificationBell />
                <UserAvatarMenu emoji={avatarEmoji} role={role} />
              </>
            ) : (
              <>
                {/* Theme, accent and language live on /settings
                    (2026-11-17); signed out there is no profile menu to
                    reach it from, so it is one icon here. Signed in it is
                    a row in UserAvatarMenu. */}
                <Link
                  href="/settings"
                  aria-label={t("settings")}
                  title={t("settings")}
                  className={`flex h-11 w-11 items-center justify-center rounded-full border transition-transform md:h-9 md:w-9 hover:-translate-y-0.5 ${controlToneClasses(false)}`}
                >
                  <SettingsIcon className="h-4 w-4" />
                </Link>
                <button
                  type="button"
                  onClick={() => setAuthModal("sign-in")}
                  className={`rounded-full border px-4 py-2 text-sm font-bold ${signInToneClasses}`}
                >
                  {t("signIn")}
                </button>
                <button
                  type="button"
                  onClick={() => setAuthModal("sign-up")}
                  className="rounded-full bg-accent px-4 py-2 text-sm font-black text-accent-foreground"
                >
                  {t("shareYourStory")}
                </button>
              </>
            )}
          </div>
        </nav>

        {/* shrink-0: when the row is tight it is the title on the left that
            gives way (it truncates), never these controls -- "Sign in" used
            to be squeezed onto two lines on the Costs page. */}
        <div className="ml-auto flex shrink-0 items-center gap-2 md:hidden">
          {!signedIn && !onAuthPage && (
            // Signed out on a phone: Sign in is the one thing out front; the
            // theme and language switches live in the menu (2026-11-16).
            <button
              type="button"
              onClick={() => setAuthModal("sign-in")}
              // The one solid button in the bar: the action a visitor
              // came for, with the flag and ☰ left plain beside it.
              className="press min-h-10 shrink-0 rounded-full bg-accent px-4 text-sm font-bold whitespace-nowrap text-accent-foreground"
            >
              {t("signIn")}
            </button>
          )}
          {signedIn ? (
            // Signed in on a phone: the bell and the country flag. The flag
            // replaced a + for a new story (2026-11-19): My Stories already
            // has its own New story button, while switching country had no
            // way in from the bar. The avatar and everything its menu held
            // (About included) live on the Profile tab's screen
            // (components/profile-links.tsx).
            <>
              <NotificationBell />
              <CountrySwitcher />
            </>
          ) : (
            <MobileNavToggle
              navItems={[
                ...mobileNavItems,
                {
                  label: t("shareYourStory"),
                  onClick: () => setAuthModal("sign-up"),
                },
              ]}
              secondaryItems={[{ href: "/settings", label: t("settings") }]}
            />
          )}
        </div>
      </div>

      <AuthModal
        open={authModal === "sign-in"}
        onClose={() => setAuthModal(null)}
        title={t("signIn")}
      >
        {/* Deliberately no "/account" default here -- an empty next tells
            signInAction "nothing specific was requested," so it can land
            staff roles on their own dashboard instead (see
            lib/auth/post-login-redirect.ts). This modal is only ever opened
            from a public page with no protected-route redirect pending, so
            there's never a real next to preserve. */}
        <SignInForm next="" />
      </AuthModal>
      <AuthModal
        open={authModal === "sign-up"}
        onClose={() => setAuthModal(null)}
        title={t("createYourAccount")}
      >
        <SignUpForm />
      </AuthModal>
    </header>
  );
}
