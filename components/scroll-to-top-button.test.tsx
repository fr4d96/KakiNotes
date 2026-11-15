import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScrollToTopButton } from "./scroll-to-top-button";

// jsdom has no layout, so the page's size and scroll position are set by
// hand: a 3000px page in an 800px window.
function setPage(scrollY: number) {
  Object.defineProperty(window, "scrollY", {
    value: scrollY,
    configurable: true,
  });
  Object.defineProperty(window, "innerHeight", {
    value: 800,
    configurable: true,
  });
  Object.defineProperty(document.documentElement, "scrollHeight", {
    value: 3000,
    configurable: true,
  });
}

async function scrollTo(y: number) {
  setPage(y);
  await act(async () => {
    window.dispatchEvent(new Event("scroll"));
    await new Promise((r) => requestAnimationFrame(() => r(null)));
  });
}

const button = () =>
  screen.getByRole("button", { name: "Back to top", hidden: true });

beforeEach(() => {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  window.matchMedia = vi.fn().mockReturnValue({ matches: false });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ScrollToTopButton", () => {
  it("stays hidden near the top and in the middle of a long page", async () => {
    setPage(0);
    render(<ScrollToTopButton />);
    await scrollTo(0);
    expect(button()).toHaveAttribute("data-visible", "false");
    await scrollTo(1000);
    expect(button()).toHaveAttribute("data-visible", "false");
  });

  it("appears at the bottom and scrolls smoothly back to the top", async () => {
    setPage(0);
    render(<ScrollToTopButton />);
    await scrollTo(2200);
    expect(button()).toHaveAttribute("data-visible", "true");

    fireEvent.click(button());
    expect(window.scrollTo).toHaveBeenCalledWith({
      top: 0,
      behavior: "smooth",
    });
  });
});
