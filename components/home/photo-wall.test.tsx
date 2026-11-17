import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PhotoWall, wallColumns, type WallTile } from "./photo-wall";

function tiles(n: number): WallTile[] {
  return Array.from({ length: n }, (_, i) => ({
    slug: `story-${i}`,
    title: `Story ${i}`,
    place: `Place ${i}`,
    url: `/media/${i}`,
  }));
}

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

describe("wallColumns", () => {
  it("fills every column, even from a single story", () => {
    const columns = wallColumns(tiles(1));
    expect(columns).toHaveLength(5);
    for (const column of columns) expect(column).toHaveLength(6);
  });

  it("starts neighbouring columns on different stories", () => {
    const columns = wallColumns(tiles(12));
    expect(columns[0][0].slug).not.toBe(columns[1][0].slug);
  });

  it("returns nothing for no stories", () => {
    expect(wallColumns([])).toEqual([]);
  });
});

describe("PhotoWall", () => {
  it("links each photo to its story, kept out of the tab order", () => {
    const { container } = render(
      <PhotoWall tiles={tiles(3)} pauseLabel="Pause" playLabel="Play" />,
    );
    const links = container.querySelectorAll<HTMLAnchorElement>("a");
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.getAttribute("href")).toMatch(/^\/stories\/story-\d$/);
      expect(link).toHaveAttribute("tabindex", "-1");
    }
  });

  it("pauses the moving photos and offers to play them again", () => {
    const { container } = render(
      <PhotoWall tiles={tiles(3)} pauseLabel="Pause" playLabel="Play" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    expect(container.querySelector(".photo-wall")).toHaveAttribute(
      "data-paused",
    );
  });

  it("draws nothing without photos", () => {
    const { container } = render(
      <PhotoWall tiles={[]} pauseLabel="Pause" playLabel="Play" />,
    );
    expect(container.firstChild).toBeNull();
  });
});
