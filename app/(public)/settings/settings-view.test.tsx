import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("@/app/(auth)/actions", () => ({ signOutAction: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
  usePathname: () => "/settings",
}));
vi.mock("@/lib/i18n/set-locale-action", () => ({
  setLocaleAction: vi.fn(async (locale: string) => ({ ok: true, locale })),
}));

// The avatar section's Server Action (server-only under jsdom), and the
// browser Supabase client behind the viewer store: signed out unless a test
// says otherwise, so the avatar section stays hidden by default.
const { setAvatarAction, sessionMock } = vi.hoisted(() => ({
  setAvatarAction: vi.fn(async (value: string) => ({
    ok: true as const,
    avatarEmoji: value || null,
  })),
  sessionMock: { current: null as { user: { id: string } } | null },
}));
vi.mock("./actions", () => ({ setAvatarAction }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: () =>
        Promise.resolve({ data: { session: sessionMock.current } }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({
              data: table === "contributors" ? { avatar_emoji: "🥝" } : null,
            }),
        }),
      }),
    }),
  }),
}));

import { setLocaleAction } from "@/lib/i18n/set-locale-action";
import {
  resetViewerIdentityForTests,
  useViewerIdentity,
} from "@/lib/auth/viewer-identity";
import { SettingsView } from "./settings-view";

// The Report a bug dialog's Server Action pulls in server-only modules;
// these tests only render its trigger.
vi.mock("@/lib/bug-reports/submit-action", () => ({
  submitBugReportAction: vi.fn(),
}));

const html = document.documentElement;

// This test environment provides no localStorage, so stub a minimal
// in-memory one (same pattern as my-stories-view.test.tsx).
let store: Record<string, string> = {};

beforeEach(() => {
  resetViewerIdentityForTests();
  sessionMock.current = null;
  setAvatarAction.mockClear();
  store = {};
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  });
});

beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }));
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  html.removeAttribute("style");
  delete html.dataset.theme;
  refresh.mockClear();
});

describe("SettingsView", () => {
  it("applies and remembers a preset accent, and goes back to Kingfisher", () => {
    render(<SettingsView locale="en" />);
    fireEvent.click(screen.getByRole("radio", { name: "Cobalt" }));

    expect(screen.getByRole("radio", { name: "Cobalt" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(html.style.getPropertyValue("--user-accent-light")).toMatch(/^#/);
    expect(JSON.parse(localStorage.getItem("kakinotes-accent")!).source).toBe(
      "#2747d8",
    );

    fireEvent.click(screen.getByRole("button", { name: "Back to Kingfisher" }));
    expect(localStorage.getItem("kakinotes-accent")).toBeNull();
    expect(html.style.getPropertyValue("--user-accent-light")).toBe("");
    expect(screen.getByRole("radio", { name: "Kingfisher" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("takes any colour from the picker", () => {
    render(<SettingsView locale="en" />);
    fireEvent.change(screen.getByLabelText("Pick any colour"), {
      target: { value: "#ffcc00" },
    });
    expect(JSON.parse(localStorage.getItem("kakinotes-accent")!).source).toBe(
      "#ffcc00",
    );
    expect(screen.getByLabelText("Pick any colour")).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("switches theme, and back to following the device", () => {
    render(<SettingsView locale="en" />);
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(html.dataset.theme).toBe("dark");
    expect(localStorage.getItem("journiq-theme")).toBe("dark");

    fireEvent.click(screen.getByRole("radio", { name: "Match device" }));
    expect(localStorage.getItem("journiq-theme")).toBeNull();
    expect(html.dataset.theme).toBe("light");
  });

  it("switches language and redraws the page in it", async () => {
    render(<SettingsView locale="en" />);
    fireEvent.click(screen.getByRole("radio", { name: "简体中文" }));
    await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(setLocaleAction).toHaveBeenCalledWith("zh-CN");
  });

  it("shows no avatar section to a signed-out reader", async () => {
    render(<SettingsView locale="en" />);
    await vi.waitFor(() => expect(true).toBe(true));
    expect(screen.queryByRole("group", { name: "Avatar" })).toBeNull();
  });

  it("lets a signed-in viewer pick an avatar, saved at once and shown in the header store", async () => {
    sessionMock.current = { user: { id: "user-1" } };
    let headerEmoji: string | null = null;
    function HeaderProbe() {
      headerEmoji = useViewerIdentity().avatarEmoji;
      return null;
    }
    render(
      <>
        <HeaderProbe />
        <SettingsView locale="en" />
      </>,
    );

    // The grid is folded away until "Change".
    fireEvent.click(await screen.findByRole("button", { name: "Change" }));
    // Read the way the server reads it: the contributor's avatar.
    const kiwi = await screen.findByRole("button", {
      name: "Use 🥝 as your avatar",
    });
    expect(kiwi).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(
      screen.getByRole("button", { name: "Use 🐧 as your avatar" }),
    );
    expect(headerEmoji).toBe("🐧");
    await vi.waitFor(() => expect(setAvatarAction).toHaveBeenCalledWith("🐧"));
    expect(
      screen.getByRole("button", { name: "Use 🐧 as your avatar" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("lists the profile links and Sign out for a signed-in viewer", async () => {
    sessionMock.current = { user: { id: "user-1" } };
    render(<SettingsView locale="en" />);
    const links = await screen.findByRole("navigation", {
      name: "Your profile",
    });
    for (const [name, href] of [
      ["My Photos", "/my-photos"],
      ["Affirmation notes", "/affirmations"],
      ["Account", "/account"],
      ["Notifications", "/notifications"],
      ["About", "/about"],
    ]) {
      expect(within(links).getByRole("link", { name })).toHaveAttribute(
        "href",
        href,
      );
    }
    expect(
      screen.getByRole("button", { name: "Sign out" }),
    ).toBeInTheDocument();
  });

  it("puts the old avatar back and says so when the save fails", async () => {
    sessionMock.current = { user: { id: "user-1" } };
    setAvatarAction.mockResolvedValueOnce({
      ok: false,
      reason: "failed",
    } as never);
    render(<SettingsView locale="en" />);
    fireEvent.click(await screen.findByRole("button", { name: "Change" }));
    await screen.findByRole("button", { name: "Use 🥝 as your avatar" });

    fireEvent.click(
      screen.getByRole("button", { name: "Use 🐧 as your avatar" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't save your avatar",
    );
    expect(
      screen.getByRole("button", { name: "Use 🥝 as your avatar" }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});
