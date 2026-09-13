import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocaleToggle } from "@/components/locale-toggle";
import { setTestLocale } from "@/tests/support/i18n";

const { refresh, setLocaleAction } = vi.hoisted(() => ({
  refresh: vi.fn(),
  setLocaleAction: vi.fn(async (locale: string) => ({ ok: true, locale })),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

// The real action is "use server" and reads next/headers' cookies(), which
// has no request scope under jsdom. The contract under test here is only
// that the toggle calls it with the OTHER locale and refreshes on success.
vi.mock("@/lib/i18n/set-locale-action", () => ({
  setLocaleAction,
}));

afterEach(() => {
  setTestLocale("en");
  refresh.mockClear();
  setLocaleAction.mockClear();
});

describe("LocaleToggle", () => {
  it("offers Chinese while English is active, with an English accessible name", () => {
    render(<LocaleToggle />);
    const button = screen.getByRole("button", { name: "Switch to Chinese" });
    expect(button).toHaveTextContent("中");
    expect(button).toHaveAttribute("title", "Switch to Chinese");
  });

  it("offers English while Chinese is active, with a Chinese accessible name", () => {
    setTestLocale("zh-CN");
    render(<LocaleToggle />);
    const button = screen.getByRole("button", { name: "切换到英文" });
    expect(button).toHaveTextContent("EN");
  });

  it("writes the other locale through the action and refreshes the route", async () => {
    render(<LocaleToggle />);
    fireEvent.click(screen.getByRole("button", { name: "Switch to Chinese" }));

    await waitFor(() => expect(setLocaleAction).toHaveBeenCalledWith("zh-CN"));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("does not refresh when the action rejects the value", async () => {
    setLocaleAction.mockResolvedValueOnce({ ok: false } as never);
    render(<LocaleToggle />);
    fireEvent.click(screen.getByRole("button", { name: "Switch to Chinese" }));

    await waitFor(() => expect(setLocaleAction).toHaveBeenCalledTimes(1));
    expect(refresh).not.toHaveBeenCalled();
  });

  it("is a real button, so it is keyboard operable", () => {
    render(<LocaleToggle />);
    const button = screen.getByRole("button", { name: "Switch to Chinese" });
    expect(button.tagName).toBe("BUTTON");
    expect(button).toHaveAttribute("type", "button");
  });
});
