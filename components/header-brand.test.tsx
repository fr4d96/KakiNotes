import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { usePathnameMock } = vi.hoisted(() => ({
  usePathnameMock: vi.fn(() => "/"),
}));
vi.mock("next/navigation", () => ({ usePathname: usePathnameMock }));

import { HeaderBrand } from "./header-brand";

beforeEach(() => {
  usePathnameMock.mockReturnValue("/");
});

describe("HeaderBrand", () => {
  it("shows the Kakinotes wordmark where the page has no bar title", () => {
    render(<HeaderBrand />);
    const home = screen.getByRole("link", { name: "Kakinotes" });
    expect(home).toHaveAttribute("href", "/");
    expect(within(home).getByText("Kakinotes")).not.toHaveClass(
      "max-md:sr-only",
    );
  });

  it("names a label page in the bar on phones, keeping the logo link", () => {
    usePathnameMock.mockReturnValue("/my-stories");
    const { container } = render(<HeaderBrand />);

    // The logo still links home and keeps its accessible name; only the
    // drawn wordmark gives way on a phone.
    const home = screen.getByRole("link", { name: "Kakinotes" });
    expect(within(home).getByText("Kakinotes")).toHaveClass("max-md:sr-only");

    // The bar title is presentation only (the page's own <h1> carries the
    // name for assistive tech) and phone-only.
    const barTitle = container.querySelector("span[aria-hidden='true']")!;
    expect(barTitle).toHaveTextContent("My Stories");
    expect(barTitle).toHaveClass("md:hidden", "truncate");
  });

  it("links the logo to the country home it is given", () => {
    usePathnameMock.mockReturnValue("/cn/stories");
    render(<HeaderBrand homeHref="/cn" />);
    expect(screen.getByRole("link", { name: "Kakinotes" })).toHaveAttribute(
      "href",
      "/cn",
    );
  });
});
