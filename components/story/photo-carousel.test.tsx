import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PhotoCarousel, type CarouselPhoto } from "./photo-carousel";

function photos(n: number): CarouselPhoto[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    url: `https://example.test/p${i + 1}.jpg`,
    alt: `Photo number ${i + 1}`,
    caption: i === 0 ? "Arriving in Queenstown" : null,
  }));
}

describe("PhotoCarousel", () => {
  it("shows every photo as a swipeable, snapping slide with a counter and dots", () => {
    const { container } = render(<PhotoCarousel photos={photos(3)} />);

    const carousel = screen.getByRole("region", { name: "Story photos" });
    expect(carousel).toHaveAttribute("aria-roledescription", "carousel");

    const slides = within(carousel).getAllByRole("group");
    expect(slides.map((s) => s.getAttribute("aria-label"))).toEqual([
      "Photo 1 of 3",
      "Photo 2 of 3",
      "Photo 3 of 3",
    ]);
    for (const slide of slides) {
      expect(slide).toHaveClass("snap-center", "shrink-0", "w-full");
    }
    const scroller = slides[0].parentElement!;
    expect(scroller).toHaveClass("snap-x", "snap-mandatory", "overflow-x-auto");
    // Keyboard users can focus it and scroll with the arrow keys.
    expect(scroller).toHaveAttribute("tabindex", "0");

    expect(screen.getByText("1/3")).toBeInTheDocument();
    const dots = container.querySelectorAll("[aria-hidden='true'] > span");
    expect(dots).toHaveLength(3);
    expect(dots[0]).toHaveAttribute("data-active", "true");
    expect(dots[0]).toHaveClass("bg-accent");

    // Each photo fills the shared frame and still opens the viewer.
    const img = screen.getByRole("img", { name: "Photo number 1" });
    expect(img).toHaveClass("h-full", "w-full", "object-cover");
    expect(screen.getByText("Arriving in Queenstown")).toBeInTheDocument();
  });

  it("offers Next on the first photo but no Previous (desktop buttons)", () => {
    render(<PhotoCarousel photos={photos(3)} />);
    expect(
      screen.getByRole("button", { name: "Next photo" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Previous photo" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the dot row to five, Instagram-style, however many photos", () => {
    const { container } = render(<PhotoCarousel photos={photos(9)} />);
    const dots = container.querySelectorAll("[aria-hidden='true'] > span");
    expect(dots).toHaveLength(5);
    // More photos beyond the window: the far edge dot is drawn smaller.
    expect(dots[4]).toHaveClass("h-1", "w-1");
    expect(screen.getByText("1/9")).toBeInTheDocument();
  });

  it("is just the photo when there is only one", () => {
    const { container } = render(<PhotoCarousel photos={photos(1)} />);
    expect(screen.queryByText("1/1")).not.toBeInTheDocument();
    expect(
      container.querySelectorAll("[aria-hidden='true'] > span"),
    ).toHaveLength(0);
    expect(
      screen.queryByRole("button", { name: "Next photo" }),
    ).not.toBeInTheDocument();
  });

  it("holds a sheen for a photo still minting and shows a failed one's message", () => {
    render(
      <PhotoCarousel
        photos={[
          { id: "a", url: null, alt: "" },
          {
            id: "b",
            url: null,
            error: "This photo could not be loaded",
            alt: "",
          },
        ]}
      />,
    );
    expect(screen.getByRole("status", { name: "Loading image" })).toHaveClass(
      "nf-skeleton",
    );
    expect(
      screen.getByText("This photo could not be loaded"),
    ).toBeInTheDocument();
  });

  it("renders nothing without photos", () => {
    const { container } = render(<PhotoCarousel photos={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
