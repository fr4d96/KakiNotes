"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  EditorialPencilIcon,
  ContributorIcon,
  HomeIcon,
  FolderIcon,
  JournalIcon,
  UsersIcon,
} from "@/components/icons";
import { useViewerIdentity } from "@/lib/auth/viewer-identity";
import { ScrollToTopButton } from "@/components/scroll-to-top-button";
import { countryUrlPrefix } from "@/lib/story/countries";
import { useCurrentCountry } from "@/lib/story/use-current-country";
import {
  isContributorArea,
  isWithin,
  showsTabBar,
} from "@/lib/navigation/app-chrome";
import {
  clearTabMemory,
  forgetTab,
  getTabMemoryServerSnapshot,
  getTabMemorySnapshot,
  parseTabMemory,
  recallTab,
  rememberLocation,
  saveTabScroll,
  subscribeTabMemory,
} from "@/lib/navigation/tab-memory";

/**
 * App-style bottom tab bar for phones (below `md`), rendered by the (public),
 * (auth) and (contributor) layouts beside their header. It repeats the
 * header's primary destinations -- same hrefs, same `nav.*` message keys --
 * with the visitor's own entry point as the last tab: "Sign in" when signed
 * out, "My Stories" when signed in. Signed in, the third tab is the
 * contributor's own story Folders (/my-stories/map) instead of Contributors
 * (Contributors stays in the header menu); signed out it stays Contributors.
 * It used to be the Journey map; since 2026-11-15 each folder opens its own
 * trip's journey instead (/my-stories/journey/<main story id>), so those
 * pages light this tab too. There is no separate journey list any more.
 * "My Stories" covers the contributor area (My Stories, My
 * Photos, Account, Notifications and the story editor/preview screens).
 * About and the rest stay in the header's hamburger / avatar menu.
 *
 * Like SiteHeader it checks the session client-side only, via the shared
 * store in lib/auth/viewer-identity.ts, so every public page's server-rendered HTML stays
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
 *  - it floats as a rounded "liquid glass" pill (translucent, blurred
 *    backdrop, see `.nf-glass` in globals.css) clear of the screen edges;
 *  - a glass bubble slides between tabs behind the active one and the newly
 *    active icon pops once;
 *  - tapping the tab you are already on scrolls to the top (at its root) or
 *    pops back to its root (deeper in it), like iOS pop-to-root;
 *  - each tab remembers the last page you were on in it and its scroll
 *    position (lib/navigation/tab-memory.ts, sessionStorage), so leaving the
 *    Stories tab mid-story and tapping it again returns to that story, scrolled
 *    to where you were; sign-out forgets all of it;
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
  // The page's country, or -- in My Stories, the editor, Account -- the one
  // remembered on this device, so Home and Stories stay in it.
  const prefix = countryUrlPrefix(useCurrentCountry());
  // The tab-wide store (lib/auth/viewer-identity.ts), shared with the
  // header; until it has an answer the layout's hint decides.
  const viewer = useViewerIdentity();
  // A contributor route has already proven a session on the server (its
  // layout's guard redirects otherwise), so it starts signed in.
  const hint = signedInHint || isContributorArea(pathname);
  const signedIn =
    viewer.status === "unknown" ? hint : viewer.status === "signed-in";
  const typing = useTextEntryFocus();
  const memorySnapshot = useSyncExternalStore(
    subscribeTabMemory,
    getTabMemorySnapshot,
    getTabMemoryServerSnapshot,
  );
  // The tab just tapped, lit at once (bubble and colour) while its page
  // loads, the way a native tab bar answers the touch before the screen
  // changes. Remembered with the path it was tapped on, so it simply stops
  // counting once the navigation lands (or is abandoned for another path).
  const [tapped, setTapped] = useState<{ root: string; from: string } | null>(
    null,
  );
  const pendingRoot = tapped && tapped.from === pathname ? tapped.root : null;
  // Remembered location per tab root. Empty on the server and first client
  // render (so hydration matches), then read from sessionStorage.
  const memory = useMemo(
    () => parseTabMemory(memorySnapshot),
    [memorySnapshot],
  );
  const avatarEmoji = viewer.avatarEmoji;

  const homeHref = prefix || "/";
  const storiesHref = `${prefix}/stories`;
  const inMyArea = isContributorArea(pathname);
  const baseTabs = [
    {
      root: homeHref,
      label: t("home"),
      Icon: HomeIcon,
      active: pathname === homeHref,
    },
    {
      root: storiesHref,
      label: t("stories"),
      Icon: JournalIcon,
      // The reader pages (/stories, /stories/<slug>) stay here; the author's
      // own screens under /stories (new, <id>/edit, <id>/preview) belong to
      // the last tab.
      active: isWithin(pathname, storiesHref) && !inMyArea,
    },
    signedIn
      ? {
          root: FOLDERS_HREF,
          label: t("folders"),
          Icon: FolderIcon,
          active: inFoldersTab(pathname),
        }
      : {
          root: `${prefix}/contributors`,
          label: t("contributors"),
          Icon: UsersIcon,
          active: isWithin(pathname, `${prefix}/contributors`),
        },
    signedIn
      ? {
          root: "/my-stories",
          label: t("myStories"),
          Icon: EditorialPencilIcon,
          // Folders, and each folder's journey, belong to their own tab;
          // Account, Notifications and the rest, to Profile.
          active:
            inMyArea && !inFoldersTab(pathname) && !inProfileTab(pathname),
        }
      : {
          root: "/sign-in",
          label: t("signIn"),
          Icon: ContributorIcon,
          active: isWithin(pathname, "/sign-in"),
        },
    // Signed in, a fifth tab: the viewer's own avatar, opening the profile
    // screen (/settings: their links, avatar and device preferences). It
    // replaced the header's avatar menu on phones (2026-11-18).
    ...(signedIn
      ? [
          {
            root: PROFILE_HREF,
            // The viewer's own username (else display name); "Profile"
            // until the store knows it.
            label: viewer.name ?? t("profile"),
            // Heard as "Profile, <name>": the name alone doesn't say where
            // the tab goes.
            ariaLabel: viewer.name
              ? `${t("profile")}, ${viewer.name}`
              : undefined,
            Icon: ContributorIcon,
            emoji: avatarEmoji,
            active: inProfileTab(pathname),
          },
        ]
      : []),
  ];

  const activeRoot = baseTabs.find((tab) => tab.active)?.root ?? null;
  // Where each link goes: the active tab always links to its root (tap =
  // pop to root / scroll to top); any other tab links to where you left it.
  const tabs = baseTabs.map((tab) => {
    const remembered = tab.active ? undefined : memory[tab.root];
    return { ...tab, href: remembered ?? tab.root, remembered: !!remembered };
  });

  // Set when a tab is tapped, so the scroll listener stops writing the old
  // tab's offset while the page underneath changes; read by the restore.
  const leavingRef = useRef(false);
  const restoreRef = useRef<{ path: string; scroll: number } | null>(null);

  // Record where the active tab is, whenever the page changes.
  useEffect(() => {
    if (!activeRoot || !pathname || !showsTabBar(pathname)) return;
    if (isTaskScreen(pathname)) return;
    rememberLocation(activeRoot, pathname + window.location.search);
  }, [activeRoot, pathname]);

  // Keep the active tab's scroll offset current.
  useEffect(() => {
    if (!activeRoot || !showsTabBar(pathname)) return;
    let frame = 0;
    const save = () => {
      frame = 0;
      if (leavingRef.current || isTaskScreen(window.location.pathname)) return;
      saveTabScroll(activeRoot, window.scrollY);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(save);
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") save();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", save);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [activeRoot, pathname]);

  // A tab switch that landed on a remembered page: put the scroll back once
  // the page is tall enough (it may be shorter now, or still streaming in).
  useEffect(() => {
    const pending = restoreRef.current;
    restoreRef.current = null;
    if (!pending || pending.path !== pathname) {
      leavingRef.current = false;
      return;
    }
    let frame = 0;
    let tries = 0;
    const step = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (max >= pending.scroll || tries >= 30) {
        window.scrollTo({
          top: Math.min(pending.scroll, Math.max(max, 0)),
          behavior: "instant",
        });
        leavingRef.current = false;
        return;
      }
      tries += 1;
      frame = requestAnimationFrame(step);
    };
    step();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      leavingRef.current = false;
    };
  }, [pathname]);

  // Signing out forgets every tab's place (My Stories, Folders, Profile).
  const wasSignedIn = useRef(signedIn);
  useEffect(() => {
    if (wasSignedIn.current && !signedIn) clearTabMemory();
    wasSignedIn.current = signedIn;
  }, [signedIn]);

  if (!showsTabBar(pathname)) return null;

  const litIndex = pendingRoot
    ? tabs.findIndex((tab) => tab.root === pendingRoot)
    : -1;
  const activeIndex =
    litIndex >= 0 ? litIndex : tabs.findIndex((tab) => tab.active);
  const hidden = isTaskScreen(pathname) || typing;

  return (
    <>
      {/* Keeps the footer and last content clear of the fixed bar. Gone while
          the bar is hidden, so a task screen gets its full height back. */}
      {/* Shows once the reader reaches the bottom of a long page; left out
          wherever the bar itself is hidden (editor, typing). */}
      {!hidden && <ScrollToTopButton />}
      {!hidden && (
        <div
          aria-hidden="true"
          className="h-(--tab-bar-clearance) md:hidden print:hidden"
        />
      )}
      <nav
        aria-label={t("tabBar")}
        data-hidden={hidden ? "true" : "false"}
        // `inert` takes the whole bar out of the tab order and the
        // accessibility tree while it is slid away.
        inert={hidden}
        className="nf-tab-bar nf-glass fixed bottom-(--tab-bar-gap) left-[max(0.75rem,env(safe-area-inset-left))] right-[max(0.75rem,env(safe-area-inset-right))] z-40 rounded-full p-1 text-foreground md:hidden print:hidden"
      >
        <div className="relative">
          <span
            aria-hidden="true"
            data-testid="tab-indicator"
            className="nf-tab-indicator pointer-events-none absolute inset-y-0 left-0"
            style={{
              width: `${100 / tabs.length}%`,
              transform: `translateX(${Math.max(activeIndex, 0) * 100}%)`,
              opacity: activeIndex < 0 ? 0 : 1,
            }}
          >
            <span className="nf-tab-bubble block h-full w-full rounded-full" />
          </span>
          <ul
            className="relative grid"
            style={{
              gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`,
            }}
          >
            {tabs.map(
              ({ root, href, remembered, label, Icon, active, ...tab }) => (
                <li key={root}>
                  <Link
                    href={href}
                    // A remembered page keeps its own scroll: restored by the
                    // effect above instead of Next resetting to the top.
                    scroll={remembered ? false : undefined}
                    transitionTypes={["tab"]}
                    aria-current={active ? "page" : undefined}
                    aria-label={"ariaLabel" in tab ? tab.ariaLabel : undefined}
                    onClick={(event) => {
                      // Native tab-bar behaviour: tapping the tab you are
                      // already on (at its root) scrolls to the top instead of
                      // re-navigating to the same URL.
                      if (!isPlainClick(event)) return;
                      if (!isSameLocation(pathname, href)) {
                        if (active) {
                          // Pop to root: forget where this tab had gone, and
                          // land at the top of the root. Next's own reset
                          // can't be trusted here -- seen in the iPhone frame
                          // (2026-11-21), popping from a story scrolled 1000px
                          // opened /stories still scrolled 1000px.
                          forgetTab(root);
                          leavingRef.current = true;
                          restoreRef.current = {
                            path: root.split(/[?#]/)[0],
                            scroll: 0,
                          };
                        } else {
                          if (activeRoot)
                            saveTabScroll(activeRoot, window.scrollY);
                          leavingRef.current = true;
                          const saved = recallTab(root);
                          restoreRef.current = saved
                            ? {
                                path: saved.href.split(/[?#]/)[0],
                                scroll: saved.scroll,
                              }
                            : null;
                        }
                        setTapped({ root, from: pathname ?? "" });
                        return;
                      }
                      event.preventDefault();
                      if (activeRoot) saveTabScroll(root, 0);
                      window.scrollTo({
                        top: 0,
                        behavior: prefersReducedMotion() ? "instant" : "smooth",
                      });
                    }}
                    className={`press relative flex min-h-14 min-w-11 flex-col items-center justify-center gap-0.5 rounded-full px-1 text-xs font-bold focus-visible:outline-offset-[-3px] ${
                      (pendingRoot ? root === pendingRoot : active)
                        ? "text-accent"
                        : "text-muted-foreground"
                    }`}
                  >
                    {"emoji" in tab && tab.emoji ? (
                      // The viewer's chosen avatar stands in for the icon.
                      <span
                        aria-hidden="true"
                        className="nf-tab-icon grid h-6 w-6 place-items-center text-[1.15rem] leading-none"
                      >
                        {tab.emoji}
                      </span>
                    ) : (
                      <Icon className="nf-tab-icon h-6 w-6" />
                    )}
                    <span className="max-w-full truncate">{label}</span>
                  </Link>
                </li>
              ),
            )}
          </ul>
        </div>
      </nav>
    </>
  );
}

const FOLDERS_HREF = "/my-stories/map";

// The signed-in Profile tab opens the "You" page (2026-11-21); /settings
// stays the signed-out preferences page and still lights this tab.
const PROFILE_HREF = "/account";

/**
 * The Profile tab: the profile screen itself and the account places it
 * links to. My Stories keeps the writing screens.
 */
function inProfileTab(pathname: string | null): boolean {
  return (
    isWithin(pathname, PROFILE_HREF) ||
    isWithin(pathname, "/settings") ||
    isWithin(pathname, "/notifications") ||
    isWithin(pathname, "/my-photos") ||
    isWithin(pathname, "/affirmations")
  );
}

/** The Folders tab: the folder list and any one trip's journey page. */
function inFoldersTab(pathname: string | null): boolean {
  return (
    isWithin(pathname, FOLDERS_HREF) ||
    !!pathname?.startsWith("/my-stories/journey/")
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
