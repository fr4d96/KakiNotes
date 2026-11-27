import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StoryGlance } from "./story-glance";

const all = {
  tripRange: "2–5 Nov 2026",
  tripDays: 4,
  readingMinutes: 3,
  cost: "$502.80",
  photoCount: 10,
  subStoryCount: 8,
};

describe("StoryGlance", () => {
  it("shows the trip and reading time as plain facts", () => {
    render(<StoryGlance {...all} />);
    expect(screen.getByText("2–5 Nov 2026 · 4 days")).toBeInTheDocument();
    expect(screen.getByText("3 min read")).toBeInTheDocument();
    // Facts are not links.
    expect(
      screen.queryByRole("link", { name: /min read/ }),
    ).not.toBeInTheDocument();
  });

  it("makes every fact with a section of its own a jump link", () => {
    render(<StoryGlance {...all} />);
    expect(
      screen.getByRole("link", { name: "$502.80 trip cost" }),
    ).toHaveAttribute("href", "#costs");
    expect(screen.getByRole("link", { name: "10 photos" })).toHaveAttribute(
      "href",
      "#photos",
    );
    expect(screen.getByRole("link", { name: "8 sub stories" })).toHaveAttribute(
      "href",
      "#sub-stories",
    );
  });

  it("leaves out what the story doesn't have", () => {
    render(
      <StoryGlance
        {...all}
        tripRange={null}
        cost={null}
        photoCount={0}
        subStoryCount={1}
      />,
    );
    expect(screen.queryByText(/days/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /cost/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /photo/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "1 sub story" }),
    ).toBeInTheDocument();
  });

  it("renders nothing with nothing to say", () => {
    const { container } = render(
      <StoryGlance
        tripRange={null}
        tripDays={null}
        readingMinutes={null}
        cost={null}
        photoCount={0}
        subStoryCount={0}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
