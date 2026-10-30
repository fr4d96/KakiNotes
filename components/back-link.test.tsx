import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { usePathnameMock } = vi.hoisted(() => ({
  usePathnameMock: vi.fn(() => "/stories/abc/edit"),
}));
vi.mock("next/navigation", () => ({ usePathname: usePathnameMock }));
const back = vi.spyOn(window.history, "back").mockImplementation(() => {});

import { BackLink } from "./back-link";
import { noteInAppNavigation } from "@/lib/navigation/in-app-history";

beforeEach(() => {
  back.mockReset();
  usePathnameMock.mockReturnValue("/stories/abc/edit");
});

describe("BackLink", () => {
  it("on a story page, falls back to its link when there is no in-app history", async () => {
    render(<BackLink variant="bar" />);
    const link = screen.getByRole("link", { name: "Back" });
    expect(link).toHaveAttribute("href", "/my-stories");
    // Visible at every width: no md:hidden on a story page.
    expect(link).not.toHaveClass("md:hidden");
    // Nothing visited yet in this tab, so the click must not call back().
    link.addEventListener("click", (e) => e.preventDefault());
    await userEvent.click(link);
    expect(back).not.toHaveBeenCalled();
  });

  it("on a story page, goes back to wherever the reader came from", async () => {
    noteInAppNavigation();
    render(<BackLink variant="bar" />);
    await userEvent.click(screen.getByRole("link", { name: "Back" }));
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("leaves a story page's arrow to the top bar, not the heading row", () => {
    render(<BackLink />);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("names a fixed destination on a sub-page", () => {
    usePathnameMock.mockReturnValue("/my-photos");
    render(<BackLink />);
    expect(
      screen.getByRole("link", { name: "Back to My Stories" }),
    ).toHaveAttribute("href", "/my-stories");
  });
});
