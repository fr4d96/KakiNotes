import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const usePathnameMock = vi.hoisted(() => vi.fn(() => "/"));
vi.mock("next/navigation", () => ({ usePathname: usePathnameMock }));

const hardNavigateMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/story/country-cookie", async (orig) => ({
  ...(await orig<typeof import("@/lib/story/country-cookie")>()),
  hardNavigate: hardNavigateMock,
}));

import { CountrySwitcher } from "./country-switcher";

afterEach(() => {
  document.cookie = "kakinotes-country=; path=/; max-age=0";
  usePathnameMock.mockReturnValue("/");
});

describe("CountrySwitcher", () => {
  it("shows the page's country as a flag, and lists every country with its flag", () => {
    usePathnameMock.mockReturnValue("/cn/stories");
    render(<CountrySwitcher />);

    const button = screen.getByRole("button", {
      name: "Country: China. Change country",
    });
    expect(button.textContent).toContain("🇨🇳");

    fireEvent.click(button);
    const sheet = screen.getByRole("dialog", { name: "Choose a country" });
    const nz = within(sheet).getByRole("button", { name: /New Zealand/ });
    const china = within(sheet).getByRole("button", { name: /China/ });
    expect(nz.textContent).toContain("🇳🇿");
    expect(china).toHaveAttribute("aria-current", "true");
    expect(nz).not.toHaveAttribute("aria-current");
    // Choosing posts to /country, which remembers it and opens that home.
    expect(nz).toHaveAttribute("name", "country");
    expect(nz).toHaveAttribute("value", "new-zealand");
    expect(nz.closest("form")).toHaveAttribute("action", "/country");
  });

  it("shows the remembered country on a page in neither country", () => {
    document.cookie = "kakinotes-country=china; path=/";
    usePathnameMock.mockReturnValue("/my-stories");
    render(<CountrySwitcher />);
    expect(
      screen.getByRole("button", { name: "Country: China. Change country" }),
    ).toBeInTheDocument();
  });

  it("switching remembers the country and does a fresh page load of its home", () => {
    usePathnameMock.mockReturnValue("/cn/stories/some-story");
    render(<CountrySwitcher />);
    fireEvent.click(
      screen.getByRole("button", { name: "Country: China. Change country" }),
    );
    const sheet = screen.getByRole("dialog", { name: "Choose a country" });
    fireEvent.click(within(sheet).getByRole("button", { name: /New Zealand/ }));
    expect(document.cookie).toContain("kakinotes-country=new-zealand");
    expect(hardNavigateMock).toHaveBeenCalledWith("/");
  });
});
