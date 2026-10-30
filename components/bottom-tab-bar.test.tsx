import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/i18n/messages/en.json";
import zhCN from "@/i18n/messages/zh-CN.json";
import { setTestLocale } from "@/tests/support/i18n";

const { usePathnameMock, sessionMock } = vi.hoisted(() => ({
  usePathnameMock: vi.fn(() => "/"),
  // Mutable so a test can flip the bar into its signed-in state.
  sessionMock: { current: null as { user: { id: string } } | null },
}));
vi.mock("next/navigation", () => ({ usePathname: usePathnameMock }));

// The real browser client needs NEXT_PUBLIC_SUPABASE_URL/KEY, which are not
// loaded under Vitest -- see components/site-header.test.tsx.
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: () =>
        Promise.resolve({ data: { session: sessionMock.current } }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
  }),
}));

import { BottomTabBar } from "./bottom-tab-bar";

beforeEach(() => {
  usePathnameMock.mockReturnValue("/");
  sessionMock.current = null;
});

afterEach(() => {
  setTestLocale("en");
});

function getBar() {
  return screen.getByRole("navigation", { name: "Quick navigation" });
}

describe("BottomTabBar", () => {
  it("renders a labelled nav with Home, Stories, Contributors and Sign in", () => {
    render(<BottomTabBar />);
    const links = Array.from(getBar().querySelectorAll("a")).map((a) => [
      a.textContent,
      a.getAttribute("href"),
    ]);
    expect(links).toEqual([
      ["Home", "/"],
      ["Stories", "/stories"],
      ["Contributors", "/contributors"],
      ["Sign in", "/sign-in"],
    ]);
  });

  it("paints My Stories from the first render when the layout proved a session", () => {
    sessionMock.current = { user: { id: "u1" } };
    usePathnameMock.mockReturnValue("/my-stories");
    render(<BottomTabBar signedInHint />);
    // Synchronous: no "Sign in" flash while getSession() is pending.
    const last = Array.from(getBar().querySelectorAll("a")).at(-1)!;
    expect(last).toHaveTextContent("My Stories");
    expect(last).toHaveAttribute("href", "/my-stories");
  });

  it("is hidden from md up and when printing, and pads for the home indicator", () => {
    render(<BottomTabBar />);
    expect(getBar()).toHaveClass("md:hidden", "print:hidden", "fixed");
    expect(getBar().className).toContain("env(safe-area-inset-bottom)");
  });

  it("marks the tab for the current route with aria-current=page", () => {
    usePathnameMock.mockReturnValue("/stories/some-story");
    render(<BottomTabBar />);
    expect(screen.getByRole("link", { name: "Stories" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Home" })).not.toHaveAttribute(
      "aria-current",
    );
    expect(
      screen.getByRole("link", { name: "Contributors" }),
    ).not.toHaveAttribute("aria-current");
  });

  it("marks only Home on the home route", () => {
    render(<BottomTabBar />);
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Stories" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("marks Sign in on the sign-in page", () => {
    usePathnameMock.mockReturnValue("/sign-in");
    render(<BottomTabBar />);
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("keeps tap targets at least 44px tall", () => {
    render(<BottomTabBar />);
    for (const link of getBar().querySelectorAll("a")) {
      expect(link).toHaveClass("min-h-14");
    }
  });

  it("swaps Sign in for My Stories once a session resolves", async () => {
    sessionMock.current = { user: { id: "user-1" } };
    usePathnameMock.mockReturnValue("/my-stories");
    render(<BottomTabBar />);
    const mine = await screen.findByRole("link", { name: "My Stories" });
    expect(mine).toHaveAttribute("href", "/my-stories");
    expect(mine).toHaveAttribute("aria-current", "page");
    await waitFor(() =>
      expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull(),
    );
  });

  it.each([
    "/my-stories",
    "/my-stories/anything",
    "/my-photos",
    "/account",
    "/account/security",
    "/notifications",
    "/stories/new",
    "/stories/3f2a/edit",
    "/stories/3f2a/preview",
  ])(
    "marks My Stories (not Stories) active on %s when signed in",
    async (path) => {
      sessionMock.current = { user: { id: "user-1" } };
      usePathnameMock.mockReturnValue(path);
      render(<BottomTabBar />);
      expect(
        await screen.findByRole("link", { name: "My Stories" }),
      ).toHaveAttribute("aria-current", "page");
      expect(screen.getByRole("link", { name: "Stories" })).not.toHaveAttribute(
        "aria-current",
      );
    },
  );

  it("keeps the Stories tab on the public reader pages when signed in", async () => {
    sessionMock.current = { user: { id: "user-1" } };
    usePathnameMock.mockReturnValue("/stories/a-public-story");
    render(<BottomTabBar />);
    expect(
      await screen.findByRole("link", { name: "My Stories" }),
    ).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Stories" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("points the tabs at the China section under /cn", () => {
    usePathnameMock.mockReturnValue("/cn/stories");
    render(<BottomTabBar />);
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute(
      "href",
      "/cn",
    );
    expect(screen.getByRole("link", { name: "Stories" })).toHaveAttribute(
      "href",
      "/cn/stories",
    );
    expect(screen.getByRole("link", { name: "Contributors" })).toHaveAttribute(
      "href",
      "/cn/contributors",
    );
  });

  it("renders its labels in Chinese when that locale is active", () => {
    setTestLocale("zh-CN");
    render(<BottomTabBar />);
    expect(
      screen.getByRole("navigation", { name: zhCN.nav.tabBar }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: zhCN.nav.home }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: zhCN.nav.signIn }),
    ).toBeInTheDocument();
  });

  it("has every message key it uses in both English and Chinese", () => {
    for (const messages of [en, zhCN]) {
      for (const key of [
        "home",
        "stories",
        "contributors",
        "signIn",
        "myStories",
        "tabBar",
      ] as const) {
        expect(messages.nav[key]).toBeTruthy();
      }
    }
  });

  describe("tab bar hiding", () => {
    // The bar is inert + aria-hidden-equivalent while hidden, so query it by
    // landmark with hidden: true.
    const bar = () =>
      screen.getByRole("navigation", {
        name: "Quick navigation",
        hidden: true,
      });

    it("is visible, with a spacer, on ordinary pages", () => {
      const { container } = render(<BottomTabBar />);
      expect(bar()).toHaveAttribute("data-hidden", "false");
      expect(bar()).not.toHaveAttribute("inert");
      expect(container.querySelector("div[aria-hidden='true']")).not.toBeNull();
    });

    it.each(["/stories/new", "/stories/3f2a/edit"])(
      "is hidden, without a spacer, on %s",
      (path) => {
        usePathnameMock.mockReturnValue(path);
        const { container } = render(<BottomTabBar />);
        expect(bar()).toHaveAttribute("data-hidden", "true");
        expect(bar()).toHaveAttribute("inert");
        expect(container.querySelector("div[aria-hidden='true']")).toBeNull();
      },
    );

    it("stays visible on the story preview and the public story pages", () => {
      for (const path of ["/stories/3f2a/preview", "/stories/some-slug"]) {
        usePathnameMock.mockReturnValue(path);
        const { unmount } = render(<BottomTabBar />);
        expect(bar()).toHaveAttribute("data-hidden", "false");
        unmount();
      }
    });

    it("hides while a text field has focus and returns when it blurs", () => {
      render(
        <>
          <input aria-label="Search" />
          <input type="checkbox" aria-label="Tick" />
          <BottomTabBar />
        </>,
      );
      const input = screen.getByLabelText("Search");
      act(() => input.focus());
      expect(bar()).toHaveAttribute("data-hidden", "true");
      act(() => input.blur());
      expect(bar()).toHaveAttribute("data-hidden", "false");

      // A checkbox raises no keyboard, so it leaves the bar alone.
      act(() => screen.getByLabelText("Tick").focus());
      expect(bar()).toHaveAttribute("data-hidden", "false");
    });

    it("hides for a textarea, a select and contenteditable too", () => {
      render(
        <>
          <textarea aria-label="Body" />
          <select aria-label="Pick">
            <option>a</option>
          </select>
          <div contentEditable suppressContentEditableWarning tabIndex={0}>
            edit
          </div>
          <BottomTabBar />
        </>,
      );
      for (const el of [
        screen.getByLabelText("Body"),
        screen.getByLabelText("Pick"),
      ]) {
        act(() => el.focus());
        expect(bar()).toHaveAttribute("data-hidden", "true");
        act(() => el.blur());
        expect(bar()).toHaveAttribute("data-hidden", "false");
      }
    });
  });

  describe("animated indicator", () => {
    it("sits under the active tab and moves with it", () => {
      const { rerender } = render(<BottomTabBar />);
      const pill = screen.getByTestId("tab-indicator");
      expect(pill.style.transform).toBe("translateX(0%)");

      usePathnameMock.mockReturnValue("/contributors");
      rerender(<BottomTabBar />);
      expect(pill.style.transform).toBe("translateX(200%)");
      expect(pill.style.opacity).toBe("1");
    });

    it("fades out when no tab matches the route", () => {
      usePathnameMock.mockReturnValue("/about");
      render(<BottomTabBar />);
      expect(screen.getByTestId("tab-indicator").style.opacity).toBe("0");
    });

    it("is decorative and every tab uses the shared press feedback", () => {
      render(<BottomTabBar />);
      expect(screen.getByTestId("tab-indicator")).toHaveAttribute(
        "aria-hidden",
        "true",
      );
      for (const link of getBar().querySelectorAll("a")) {
        expect(link).toHaveClass("press");
      }
    });
  });

  describe("tapping the active tab", () => {
    it("scrolls to the top instead of navigating", () => {
      const scrollTo = vi.fn();
      vi.stubGlobal("scrollTo", scrollTo);
      usePathnameMock.mockReturnValue("/stories");
      render(<BottomTabBar />);
      const notPrevented = fireEvent.click(
        screen.getByRole("link", { name: "Stories" }),
      );
      expect(notPrevented).toBe(false); // preventDefault was called
      expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
      vi.unstubAllGlobals();
    });

    it("scrolls instantly under reduced motion", () => {
      const scrollTo = vi.fn();
      vi.stubGlobal("scrollTo", scrollTo);
      vi.stubGlobal("matchMedia", () => ({ matches: true }));
      render(<BottomTabBar />);
      fireEvent.click(screen.getByRole("link", { name: "Home" }));
      expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "instant" });
      vi.unstubAllGlobals();
    });

    it("still navigates when the tab is active but you are deeper in it", () => {
      const scrollTo = vi.fn();
      vi.stubGlobal("scrollTo", scrollTo);
      usePathnameMock.mockReturnValue("/stories/some-story");
      render(<BottomTabBar />);
      fireEvent.click(screen.getByRole("link", { name: "Stories" }));
      expect(scrollTo).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    });

    it("does not hijack a click on another tab", () => {
      const scrollTo = vi.fn();
      vi.stubGlobal("scrollTo", scrollTo);
      render(<BottomTabBar />);
      fireEvent.click(screen.getByRole("link", { name: "Stories" }));
      expect(scrollTo).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    });
  });
});
