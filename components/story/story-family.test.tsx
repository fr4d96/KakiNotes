import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PartOfStory, SubStoryList } from "./story-family";

describe("PartOfStory", () => {
  it("links to the main story inside a labelled nav", () => {
    render(<PartOfStory parent={{ slug: "food-queenstown", title: "Food" }} />);
    expect(
      screen.getByRole("navigation", { name: /part of a larger story/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Food" })).toHaveAttribute(
      "href",
      "/stories/food-queenstown",
    );
  });

  it("renders nothing without a parent", () => {
    const { container } = render(<PartOfStory parent={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("SubStoryList", () => {
  it("lists sub stories as links, with the excerpt when present", () => {
    render(
      <SubStoryList
        subStories={[
          {
            slug: "fergburger",
            title: "Fergburger",
            excerpt: "Worth the queue",
          },
          { slug: "pie-place", title: "Pie place", excerpt: null },
        ]}
      />,
    );
    expect(
      screen.getByRole("heading", { level: 2, name: /more in this story/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Fergburger" })).toHaveAttribute(
      "href",
      "/stories/fergburger",
    );
    expect(screen.getByText("Worth the queue")).toBeInTheDocument();
  });

  it("renders titles as text, not markup", () => {
    render(<SubStoryList subStories={[{ slug: "x", title: "<b>bold</b>" }]} />);
    expect(
      screen.getByRole("link", { name: "<b>bold</b>" }),
    ).toBeInTheDocument();
  });

  it("renders nothing when empty", () => {
    const { container } = render(<SubStoryList subStories={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
