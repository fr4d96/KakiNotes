import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ContributorProfileTabs } from "./contributor-profile-tabs";

describe("ContributorProfileTabs", () => {
  it("renders nothing when the contributor has no pins", () => {
    const { container } = render(
      <ContributorProfileTabs
        slug="mei"
        active="stories"
        showJourney={false}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("links Stories and Journey and marks the active page", () => {
    render(<ContributorProfileTabs slug="mei" active="journey" showJourney />);
    expect(screen.getByRole("link", { name: "Stories" })).toHaveAttribute(
      "href",
      "/contributors/mei",
    );
    const journey = screen.getByRole("link", { name: "Journey" });
    expect(journey).toHaveAttribute("href", "/contributors/mei/journey");
    expect(journey).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Stories" })).not.toHaveAttribute(
      "aria-current",
    );
  });
});
