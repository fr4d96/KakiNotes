import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const mockPathname = vi.fn<() => string>();
vi.mock("next/navigation", () => ({ usePathname: () => mockPathname() }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
    },
  }),
}));

import {
  StaffBackLink,
  StaffNavLinks,
  activeStaffHref,
} from "./staff-nav-links";
import { StaffTabBar } from "./staff-tab-bar";
import { MODERATION_LINKS } from "@/lib/navigation/moderation-links";

const LINKS = [
  { href: "/moderation", label: "Overview", icon: "overview" as const },
  { href: "/moderation/stories", label: "Stories", icon: "stories" as const },
  { href: "/readiness", label: "Readiness", icon: "readiness" as const },
];

describe("activeStaffHref", () => {
  it.each([
    ["/moderation", "/moderation"],
    ["/moderation/stories", "/moderation/stories"],
    ["/moderation/stories/abc", "/moderation/stories"],
    ["/moderation/reports", "/moderation"],
    ["/moderationx", null],
    [null, null],
  ])("%s -> %s", (path, expected) => {
    expect(activeStaffHref(LINKS, path)).toBe(expected);
  });
});

describe("StaffNavLinks", () => {
  it("marks exactly one section as current", () => {
    mockPathname.mockReturnValue("/moderation/stories/abc");
    render(<StaffNavLinks label="Moderation" links={LINKS} />);
    expect(screen.getByRole("link", { current: "page" })).toHaveTextContent(
      "Stories",
    );
  });
});

describe("StaffBackLink", () => {
  it.each([
    ["/moderation/stories/abc", "Back to Stories", "/moderation/stories"],
    ["/moderation/stories", "Back to your profile", "/account"],
    ["/moderation", "Back to your profile", "/account"],
    ["/elsewhere", "Back to your profile", "/account"],
  ])("from %s: %s", (path, name, href) => {
    mockPathname.mockReturnValue(path);
    render(<StaffBackLink links={LINKS} />);
    expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
  });
});

describe("StaffTabBar", () => {
  it("draws every section and lights the current one", () => {
    mockPathname.mockReturnValue("/moderation/stories/abc");
    render(<StaffTabBar label="Moderation" links={LINKS} />);
    expect(screen.getAllByRole("link")).toHaveLength(3);
    const current = screen.getByRole("link", { current: "page" });
    expect(current).toHaveTextContent("Stories");
    expect(current).toHaveAttribute("href", "/moderation/stories");
  });

  it("scrolls to the top when tapping the section already open", () => {
    const scrollTo = vi.fn();
    vi.stubGlobal("scrollTo", scrollTo);
    mockPathname.mockReturnValue("/moderation/stories");
    render(<StaffTabBar label="Moderation" links={LINKS} />);
    fireEvent.click(screen.getByRole("link", { name: "Stories" }));
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
    vi.unstubAllGlobals();
  });

  it("gets out of the way while a field has focus", () => {
    mockPathname.mockReturnValue("/moderation/stories");
    render(
      <>
        <textarea aria-label="Reason" />
        <StaffTabBar label="Moderation" links={LINKS} />
      </>,
    );
    const bar = screen.getByRole("navigation", { name: "Moderation" });
    expect(bar).toHaveAttribute("data-hidden", "false");
    fireEvent.focusIn(screen.getByLabelText("Reason"));
    expect(bar).toHaveAttribute("data-hidden", "true");
  });
});

describe("the moderation bar", () => {
  it("is the four sections plus Profile; Readiness stays in the header", () => {
    mockPathname.mockReturnValue("/moderation/stories");
    render(
      <StaffTabBar label="Moderation" links={MODERATION_LINKS} profileTab />,
    );
    expect(screen.getAllByRole("link").map((l) => l.textContent)).toEqual([
      "Overview",
      "Stories",
      "Reports",
      "Takedowns",
      "Profile",
    ]);
  });

  it.each(["/account", "/notifications", "/readiness"])(
    "lights Profile on %s",
    (path) => {
      mockPathname.mockReturnValue(path);
      render(
        <StaffTabBar label="Moderation" links={MODERATION_LINKS} profileTab />,
      );
      expect(screen.getByRole("link", { current: "page" })).toHaveTextContent(
        "Profile",
      );
    },
  );

  it("swaps the root back arrow for the logo, and keeps it deeper in", () => {
    mockPathname.mockReturnValue("/moderation/stories");
    const { rerender } = render(
      <StaffBackLink links={MODERATION_LINKS} profileTab />,
    );
    expect(
      screen.getByRole("link", { name: "Kakinotes home" }),
    ).toHaveAttribute("href", "/");
    mockPathname.mockReturnValue("/moderation/stories/abc");
    rerender(<StaffBackLink links={MODERATION_LINKS} profileTab />);
    expect(
      screen.getByRole("link", { name: "Back to Stories" }),
    ).toBeInTheDocument();
  });
});
