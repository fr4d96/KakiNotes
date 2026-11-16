import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CardPhotos } from "./card-photos";

describe("CardPhotos", () => {
  it("draws a photo whose URL hasn't arrived yet as a loading sheen, still counted in the dots", () => {
    const { container } = render(
      <CardPhotos urls={["https://cdn.test/a.jpg", null, null]} href="/s/x" />,
    );
    const slots = container.querySelectorAll(".snap-x > a");
    expect(slots).toHaveLength(3);
    expect(slots[0].querySelector("img")).not.toBeNull();
    expect(slots[1].querySelector(".nf-skeleton")).not.toBeNull();
    expect(
      container.querySelectorAll("div.pointer-events-none > span"),
    ).toHaveLength(3);
  });

  it("tells the caller once, the first time the reader swipes", () => {
    const onBrowse = vi.fn();
    const { container } = render(
      <CardPhotos
        urls={["https://cdn.test/a.jpg", null]}
        href="/s/x"
        onBrowse={onBrowse}
      />,
    );
    const strip = container.querySelector(".snap-x")!;
    fireEvent.pointerDown(strip);
    fireEvent.scroll(strip);
    expect(onBrowse).toHaveBeenCalledTimes(1);
  });
});
