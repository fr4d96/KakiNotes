import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { StorySectionNav } from "./story-section-nav";

describe("StorySectionNav", () => {
  it("links to each section the page has, in order", () => {
    render(<StorySectionNav sections={["photos", "story", "costs"]} />);
    const nav = screen.getByRole("navigation", { name: "Story sections" });
    const links = Array.from(nav.querySelectorAll("a")).map((a) => [
      a.textContent,
      a.getAttribute("href"),
    ]);
    expect(links).toEqual([
      ["Photos", "#photos"],
      ["Story", "#story"],
      ["Costs", "#costs"],
    ]);
  });

  it("marks the first section as current, and follows a tap", () => {
    render(<StorySectionNav sections={["story", "sub-stories", "related"]} />);
    expect(screen.getByRole("link", { name: "Story" })).toHaveAttribute(
      "aria-current",
      "location",
    );
    fireEvent.click(screen.getByRole("link", { name: "More stories" }));
    expect(screen.getByRole("link", { name: "More stories" })).toHaveAttribute(
      "aria-current",
      "location",
    );
    expect(screen.getByRole("link", { name: "Story" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("renders nothing for a page with a single section", () => {
    const { container } = render(<StorySectionNav sections={["story"]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
