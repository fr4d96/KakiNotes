import { render, screen, fireEvent, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";

const { usePathnameMock, sessionMock } = vi.hoisted(() => ({
  usePathnameMock: vi.fn(() => "/"),
  // Mutable so a test can flip the header into its signed-in state; reset
  // to null (signed out) in beforeEach.
  sessionMock: { current: null as { user: { id: string } } | null },
}));
vi.mock("next/navigation", () => ({
  usePathname: usePathnameMock,
  // LocaleToggle (beside the theme toggle) refreshes the route after it
  // writes the language cookie; nothing here exercises that.
  useRouter: () => ({ refresh: vi.fn() }),
}));

// LocaleToggle's Server Action reads next/headers' cookies(), which has no
// request scope under jsdom -- see components/locale-toggle.test.tsx for
// the toggle's own behaviour.
vi.mock("@/lib/i18n/set-locale-action", () => ({
  setLocaleAction: vi.fn(async () => ({ ok: true })),
}));

// The real SignInForm/SignUpForm transitively import their "use server"
// action module, which in turn imports lib/supabase/server.ts's
// server-only guard -- fine in a real Next.js build (the "use server"
// directive gets specially compiled away for client bundles), but jsdom
// looks enough like a browser that the server-only package throws on
// import here. SiteHeader's own tests don't need the real forms -- those
// are covered by components/auth/auth-modal.test.tsx and the forms'
// own behavior is exercised on the real /sign-in and /sign-up pages.
vi.mock("@/components/auth/sign-in-form", () => ({
  SignInForm: () => <div>sign-in-form</div>,
}));
vi.mock("@/components/auth/sign-up-form", () => ({
  SignUpForm: () => <div>sign-up-form</div>,
}));

// Same "use server" / server-only jsdom incompatibility as above --
// components/auth/user-avatar-menu.tsx imports signOutAction directly for
// its dropdown's sign-out button.
vi.mock("@/app/(auth)/actions", () => ({
  signOutAction: vi.fn(),
}));

// The real browser client needs NEXT_PUBLIC_SUPABASE_URL/KEY, which aren't
// loaded into process.env under Vitest (unlike Next's own dev/build, which
// inlines them) -- so this stands in for it, returning whatever session
// `sessionMock.current` holds (null = signed out, the default).
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    // NotificationBell (rendered beside the avatar once signed in) counts
    // the caller's unread inbox on mount. Zero here -- the bell has its
    // own tests in components/notifications/notification-bell.test.tsx.
    rpc: () => Promise.resolve({ data: 0, error: null }),
    auth: {
      getSession: () =>
        Promise.resolve({ data: { session: sessionMock.current } }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
    from: () => ({
      select: () => ({
        // The header reads two of its OWN rows: profiles.avatar_emoji via
        // single(), user_roles.role via maybeSingle() (an account with no
        // role row is an ordinary contributor, not an error). Both resolve
        // empty here -- these tests are about the nav, not the avatar.
        eq: () => ({
          single: () => Promise.resolve({ data: null }),
          maybeSingle: () => Promise.resolve({ data: null }),
        }),
      }),
    }),
  }),
}));

import { SiteHeader } from "./site-header";
import { resetViewerIdentityForTests } from "@/lib/auth/viewer-identity";

beforeEach(() => {
  // The viewer store is tab-wide; each test starts as a fresh tab.
  resetViewerIdentityForTests();
  usePathnameMock.mockReturnValue("/");
  sessionMock.current = null;
  Object.defineProperty(window, "scrollY", {
    value: 0,
    writable: true,
    configurable: true,
  });
});

// jsdom has no matchMedia. useIsPhone() reads "(max-width: 47.99rem)", so
// this stands in for a phone-width viewport (and answers "no" to every
// other query, e.g. the sheet's own "(min-width: 48rem)" growth watcher).
function pretendPhone() {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query.includes("max-width"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}

afterEach(() => {
  // @ts-expect-error -- jsdom has no matchMedia by default; remove the stub
  delete window.matchMedia;
});

function getHeader() {
  return screen.getByRole("banner");
}

describe("SiteHeader", () => {
  // The transparent-over-hero state is gone: the home hero is now an inset
  // plate that starts below the header, so there is no photo to sit over and a
  // transparent header would have drawn white nav text onto the light page
  // ground. These assert it cannot come back by accident.
  it("is solid on the home route, unscrolled", () => {
    render(<SiteHeader />);
    expect(getHeader()).toHaveClass("journiq-header-solid");
    expect(getHeader()).not.toHaveClass("journiq-header");
    expect(getHeader()).not.toHaveClass("text-white");
  });

  it("is solid on every other route too", () => {
    usePathnameMock.mockReturnValue("/sign-in");
    render(<SiteHeader />);
    expect(getHeader()).toHaveClass("journiq-header-solid");
    expect(getHeader()).not.toHaveClass("journiq-header");
  });

  it("stays solid after scrolling on the home route", () => {
    render(<SiteHeader />);

    Object.defineProperty(window, "scrollY", {
      value: 100,
      configurable: true,
    });
    fireEvent.scroll(window);

    expect(getHeader()).toHaveClass("journiq-header-solid");
    expect(getHeader()).not.toHaveClass("journiq-header");
  });

  it("always renders the real primary nav destinations", () => {
    render(<SiteHeader />);
    expect(screen.getByRole("link", { name: "About" })).toHaveAttribute(
      "href",
      "/about",
    );
  });

  it("points the primary nav at the China section under /cn", () => {
    usePathnameMock.mockReturnValue("/cn/stories");
    render(<SiteHeader />);
    expect(screen.getByRole("link", { name: "About" })).toHaveAttribute(
      "href",
      "/cn/about",
    );
    expect(screen.getByRole("link", { name: "Stories" })).toHaveAttribute(
      "href",
      "/cn/stories",
    );
  });

  it("opens the sign-in modal from the header button instead of navigating", () => {
    render(<SiteHeader />);
    // Not merely hidden: AuthModal mounts its children only while open, so
    // the real SignInForm's id="email"/id="password" fields never duplicate
    // the ones on the real /sign-in page. See auth-modal.tsx's comment.
    expect(screen.queryByText("sign-in-form")).toBeNull();

    // The desktop and phone headers each have one (CSS shows one at a time).
    fireEvent.click(screen.getAllByRole("button", { name: "Sign in" })[0]);

    expect(
      screen.getByRole("heading", { name: "Sign in" }),
    ).toBeInTheDocument();
    expect(screen.getByText("sign-in-form")).toBeInTheDocument();
  });

  it("opens the sign-up modal from the 'Share your story' button", () => {
    render(<SiteHeader />);

    fireEvent.click(screen.getByRole("button", { name: "Share your story" }));

    expect(
      screen.getByRole("heading", { name: "Create your account" }),
    ).toBeInTheDocument();
    expect(screen.getByText("sign-up-form")).toBeInTheDocument();
  });

  it("keeps My Stories / New Story out of the public nav bar when signed in", async () => {
    sessionMock.current = { user: { id: "user-1" } };
    render(<SiteHeader />);

    // The avatar replaces the signed-out buttons once the session resolves
    // -- on desktop only. On a phone (the md:hidden cluster) the country
    // flag takes its place; the avatar is the bottom bar's Profile tab.
    const avatars = await screen.findAllByRole("button", {
      name: "Account menu",
    });
    expect(avatars).toHaveLength(1);
    expect(
      screen.queryByRole("button", { name: "Sign in" }),
    ).not.toBeInTheDocument();

    // No second "Contributor" nav bar alongside Primary -- those two links
    // belong to the (contributor) routes' own header, not this one.
    expect(
      screen.queryByRole("navigation", { name: "Contributor" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "My Stories" })).toBeNull();
    // No + for a new story in the phone bar any more (My Stories has its
    // own); the country flag sits there instead, beside the desktop one.
    expect(screen.queryByRole("link", { name: "New Story" })).toBeNull();
    expect(screen.getAllByRole("button", { name: /country/i })).toHaveLength(2);

    // They are still one click away, inside the profile icon's dropdown.
    fireEvent.click(avatars[0]);
    expect(
      screen.getByRole("menuitem", { name: "My Stories" }),
    ).toHaveAttribute("href", "/my-stories");
    expect(screen.getByRole("menuitem", { name: "New Story" })).toHaveAttribute(
      "href",
      "/stories/new",
    );
  });

  it("leaves Stories and Contributors to the bottom tab bar in the phone menu", () => {
    render(<SiteHeader />);
    // Only the desktop nav carries them before the hamburger opens.
    expect(screen.getAllByRole("link", { name: "Stories" })).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Menu" }));

    // Opening the hamburger adds About (still not in the bar) but no second
    // Stories / Contributors link.
    expect(screen.getAllByRole("link", { name: "About" })).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "Stories" })).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: "Contributors" })).toHaveLength(
      1,
    );
  });

  it("closes the modal via its close button", () => {
    render(<SiteHeader />);
    fireEvent.click(screen.getAllByRole("button", { name: "Sign in" })[0]);
    expect(screen.getByText("sign-in-form")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    // Unmounted, not just hidden — same reasoning as the open test above.
    expect(screen.queryByText("sign-in-form")).toBeNull();
  });

  describe("on a phone", () => {
    it("opens the signed-out menu as a bottom sheet named Menu", () => {
      pretendPhone();
      render(<SiteHeader />);
      const trigger = screen.getByRole("button", { name: "Menu" });
      expect(trigger).toHaveAttribute("aria-expanded", "false");
      // A round icon button: "Menu" is its accessible name, never shown as
      // a word on the button.
      expect(trigger.textContent).toBe("");
      expect(trigger.querySelector("svg")).not.toBeNull();

      fireEvent.click(trigger);

      expect(trigger).toHaveAttribute("aria-expanded", "true");
      const sheet = screen.getByRole("dialog", { name: "Menu" });
      expect(sheet).toHaveAttribute("open");
      // Rows are >=48px (min-h-12) touch targets.
      const about = within(sheet).getByRole("link", { name: "About" });
      expect(about.className).toContain("min-h-12");
      // Sign in is out front, not in the sheet. Theme, accent and language
      // live on /settings (2026-11-17): one 48px Settings row, no switches.
      expect(
        within(sheet).queryByRole("button", { name: "Sign in" }),
      ).toBeNull();
      const settings = within(sheet).getByRole("link", { name: "Settings" });
      expect(settings).toHaveAttribute("href", "/settings");
      expect(settings.className).toContain("min-h-12");
      expect(
        within(sheet).queryByRole("button", { name: /Switch to/ }),
      ).toBeNull();
    });

    it("shows Sign in out front, and the theme and language only in the menu", () => {
      pretendPhone();
      render(<SiteHeader />);
      // Two Sign in buttons exist (desktop + phone); the phone one sits
      // beside the menu button, outside any sheet.
      const phoneSignIn = screen.getAllByRole("button", { name: "Sign in" })[1];
      expect(phoneSignIn.closest('[role="dialog"], dialog')).toBeNull();
      fireEvent.click(phoneSignIn);
      expect(screen.getByText("sign-in-form")).toBeInTheDocument();
    });

    it("closes the menu sheet from its close button and after choosing an action", () => {
      pretendPhone();
      render(<SiteHeader />);
      fireEvent.click(screen.getByRole("button", { name: "Menu" }));
      const sheet = screen.getByRole("dialog", { name: "Menu" });

      fireEvent.click(within(sheet).getByRole("button", { name: "Close" }));
      expect(screen.getByRole("button", { name: "Menu" })).toHaveAttribute(
        "aria-expanded",
        "false",
      );

      // Choosing "Share your story" hands over to the sign-up modal.
      fireEvent.click(screen.getByRole("button", { name: "Menu" }));
      fireEvent.click(
        within(screen.getByRole("dialog", { name: "Menu" })).getByRole(
          "button",
          { name: "Share your story" },
        ),
      );
      expect(screen.getByText("sign-up-form")).toBeInTheDocument();
    });

    it("opens the avatar menu as a bottom sheet with 48px rows", async () => {
      pretendPhone();
      sessionMock.current = { user: { id: "user-1" } };
      render(<SiteHeader />);
      const avatars = await screen.findAllByRole("button", {
        name: "Account menu",
      });

      // Only the desktop cluster has an avatar now; on a phone-sized
      // screen (between md and the phone check) it still opens as a sheet.
      fireEvent.click(avatars[0]);

      const sheet = screen.getByRole("dialog", { name: "Account menu" });
      const myStories = within(sheet).getByRole("menuitem", {
        name: "My Stories",
      });
      expect(myStories).toHaveAttribute("href", "/my-stories");
      expect(myStories.className).toContain("min-h-12");
      expect(
        within(sheet).getByRole("menuitem", { name: "Sign out" }).className,
      ).toContain("min-h-12");
      // The sheet replaces the dropdown rather than sitting beside it.
      expect(
        screen.getAllByRole("menuitem", { name: "My Stories" }),
      ).toHaveLength(1);
    });
  });

  it("keeps the anchored dropdown (no sheet) at desktop widths", async () => {
    sessionMock.current = { user: { id: "user-1" } };
    render(<SiteHeader />);
    const avatars = await screen.findAllByRole("button", {
      name: "Account menu",
    });
    fireEvent.click(avatars[0]);
    expect(
      screen.getByRole("menuitem", { name: "My Stories" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "Account menu" }),
    ).not.toBeInTheDocument();
  });

  it("is the contributor routes' header too: their links, painted signed in", () => {
    usePathnameMock.mockReturnValue("/my-stories");
    render(<SiteHeader />);
    // Signed in from the first paint (the route's guard proved a session),
    // so no Sign in button flashes before the browser's check answers.
    expect(screen.queryByRole("button", { name: "Sign in" })).toBeNull();
    const contributor = screen.getByRole("navigation", { name: "Contributor" });
    expect(
      within(contributor).getByRole("link", { name: "My Stories" }),
    ).toHaveAttribute("href", "/my-stories");
  });

  it("draws nothing on a staff screen, which has its own header", () => {
    usePathnameMock.mockReturnValue("/moderation");
    const { container } = render(<SiteHeader />);
    expect(container.querySelector("header")).toBeNull();
  });
});
