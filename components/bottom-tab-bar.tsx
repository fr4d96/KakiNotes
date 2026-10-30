"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  EditorialPencilIcon,
  ContributorIcon,
  HomeIcon,
  JournalIcon,
  UsersIcon,
} from "@/components/icons";
import { createClient } from "@/lib/supabase/client";
import { countryFromPathname, countryUrlPrefix } from "@/lib/story/countries";

/**
 * App-style bottom tab bar for phones (below `md`), rendered by the (public),
 * (auth) and (contributor) layouts beside their header. It repeats the
 * header's primary destinations -- same hrefs, same `nav.*` message keys --
 * with the visitor's own entry point as the last tab: "Sign in" when signed
 * out, "My Stories" when signed in (the contributor area: My Stories, My
 * Photos, Account, Notifications and the story editor/preview screens).
 * About and the rest stay in the header's hamburger / avatar menu.
 *
 * Like SiteHeader it checks the session client-side only, via the browser
 * Supabase client, so every public page's server-rendered HTML stays
 * identical for every visitor. The result only picks the last tab's label
 * and link; access is enforced by proxy.ts, the (contributor) layout and
 * RLS regardless of what is drawn here.
 *
 * "Sign in" links to the real /sign-in page rather than opening the header's
 * modal: the modal's state lives in SiteHeader, and the page is a complete,
 * working sign-in screen.
 *
 * Native-app behaviour (see DESIGN.md "Touch & navigation motion"):
 *  - the bar slides down out of the way on focused task screens (the story
 *    editor, like iOS hides the tab bar on a pushed screen) and whenever a
 *    text field has focus, so it never floats above the iOS keyboard;
 *  - a pill in the accent colour slides between tabs and the newly active
 *    icon pops once;
 *  - tapping the tab you are already on scrolls to the top;
 *  - every tab uses the shared `.press` feedback.
 * The tab links carry the `tab` view-transition type so a tab switch
 * crossfades instead of sliding (components/page-transition.tsx).
 */
export function BottomTabBar({
  signedInHint = false,
}: {
  /**
   * Set by the (contributor) layout, whose guard has already proven a
   * session on the server -- so its first paint shows "My Stories" instead
   * of flashing "Sign in" until getSession() resolves. Public layouts leave
   * it false: their HTML must carry nothing per-person.
   */
  signedInHint?: boolean;
} = {}) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const prefix = countryUrlPrefix(countryFromPathname(pathname));
  const [signedIn, setSignedIn] = useState(signedInHint);
  const typing = useTextEntryFocus();

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (active) setSignedIn(!!data.session);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (active) setSignedIn(!!session);
      },
    );

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const homeHref = prefix || "/";
  const storiesHref = `${prefix}/stories`;
  const inMyArea = isContributorArea(pathname);
  const tabs = [
    {
      href: homeHref,
      label: t("home"),
      Icon: HomeIcon,
      active: pathname === homeHref,
    },
    {
      href: storiesHref,
      label: t("stories"),
      Icon: JournalIcon,
      // The reader pages (/stories, /stories/<slug>) stay here; the author's
      // own screens under /stories (new, <id>/edit, <id>/preview) belong to
      // the last tab.
      active: isWithin(pathname, storiesHref) && !inMyArea,
    },
    {
      href: `${prefix}/contributors`,
      label: t("contributors"),
      Icon: UsersIcon,
      active: isWithin(pathname, `${prefix}/contributors`),
    },
    signedIn
      ? {
          href: "/my-stories",
          label: t("myStories"),
          Icon: EditorialPencilIcon,
          active: inMyArea,
        }
      : {
          href: "/sign-in",
          label: t("signIn"),
          Icon: ContributorIcon,
          active: isWithin(pathname, "/sign-in"),
        },
  ];

  const activeIndex = tabs.findIndex((tab) => tab.active);
  const hidden = isTaskScreen(pathname) || typing;

  return (
    <>
      {/* Keeps the footer and last content clear of the fixed bar. Gone while
          the bar is hidden, so a task screen gets its full height back. */}
      {!hidden && (
        <div
          aria-hidden="true"
          className="h-[calc(3.5rem+env(safe-area-inset-bottom))] md:hidden print:hidden"
        />
      )}
      <nav
        aria-label={t("tabBar")}
        data-hidden={hidden ? "true" : "false"}
        // `inert` takes the whole bar out of the tab order and the
        // accessibility tree while it is slid away.
        inert={hidden}
        className="nf-tab-bar journiq-header-solid fixed inset-x-0 bottom-0 z-40 border-t border-border-subtle pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] text-foreground md:hidden print:hidden"
      >
        <div className="relative">
          <span
            aria-hidden="true"
            data-testid="tab-indicator"
            className="nf-tab-indicator pointer-events-none absolute left-0 top-0 flex h-[3px] w-1/4 justify-center"
            style={{
              transform: `translateX(${Math.max(activeIndex, 0) * 100}%)`,
              opacity: activeIndex < 0 ? 0 : 1,
            }}
          >
            <span className="h-full w-9 rounded-full bg-accent" />
          </span>
          <ul className="grid grid-cols-4">
            {tabs.map(({ href, label, Icon, active }) => (
              <li key={href}>
                <Link
                  href={href}
                  transitionTypes={["tab"]}
                  aria-current={active ? "page" : undefined}
                  onClick={(event) => {
                    // Native tab-bar behaviour: tapping the tab you are
                    // already on (at its root) scrolls to the top instead of
                    // re-navigating to the same URL.
                    if (!isPlainClick(event) || !isSameLocation(pathname, href))
                      return;
                    event.preventDefault();
                    window.scrollTo({
                      top: 0,
                      behavior: prefersReducedMotion() ? "instant" : "smooth",
                    });
                  }}
                  className={`press flex min-h-14 min-w-11 flex-col items-center justify-center gap-0.5 px-1 text-xs font-bold focus-visible:outline-offset-[-3px] ${
                    active ? "text-accent" : "text-muted-foreground"
                  }`}
                >
                  <Icon className="nf-tab-icon h-6 w-6" />
                  <span className="max-w-full truncate">{label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </nav>
    </>
  );
}

/** True when `pathname` is `base` or anything beneath it. */
function isWithin(pathname: string | null, base: string): boolean {
  return pathname === base || !!pathname?.startsWith(`${base}/`);
}

/**
 * The signed-in contributor's own area -- the last tab's territory. The
 * public reader routes (/stories, /stories/<slug>) are deliberately absent:
 * they keep the Stories tab.
 */
function isContributorArea(pathname: string | null): boolean {
  if (!pathname) return false;
  return (
    isWithin(pathname, "/my-stories") ||
    isWithin(pathname, "/my-photos") ||
    isWithin(pathname, "/account") ||
    isWithin(pathname, "/notifications") ||
    isWithin(pathname, "/stories/new") ||
    /^\/stories\/[^/]+\/(edit|preview)(\/|$)/.test(pathname)
  );
}

/** Focused task screens that hide the bar: starting or editing a story. */
function isTaskScreen(pathname: string | null): boolean {
  if (!pathname) return false;
  return (
    isWithin(pathname, "/stories/new") ||
    /^\/stories\/[^/]+\/edit(\/|$)/.test(pathname)
  );
}

function isSameLocation(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  const trim = (value: string) =>
    value.length > 1 ? value.replace(/\/+$/, "") : value;
  return trim(pathname) === trim(href);
}

/** A bare left click: modified clicks keep their browser meaning. */
function isPlainClick(event: React.MouseEvent): boolean {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Input types that open no on-screen keyboard. */
const NON_TEXT_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

/** An element that raises the on-screen keyboard (or a picker) when focused. */
function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) {
    return !NON_TEXT_INPUT_TYPES.has(target.type);
  }
  return target.isContentEditable;
}

/**
 * True while a text input / textarea / select / contenteditable has focus
 * anywhere in the document. Event delegation on `document` (focusin /
 * focusout bubble) so it covers fields rendered by any component. On
 * focusout the next focus target decides, so moving between two fields does
 * not flicker the bar.
 */
function useTextEntryFocus(): boolean {
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    // A field can already be focused (autoFocus) before this listens; check
    // once on the next frame (not synchronously: it is a state update).
    const frame = requestAnimationFrame(() =>
      setTyping(isTextEntry(document.activeElement)),
    );
    const onFocusIn = (event: FocusEvent) =>
      setTyping(isTextEntry(event.target));
    const onFocusOut = (event: FocusEvent) =>
      setTyping(isTextEntry(event.relatedTarget));
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  return typing;
}
