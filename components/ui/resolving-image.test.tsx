import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ResolvingImage } from "./resolving-image";

function stubComplete(value: boolean) {
  return vi
    .spyOn(HTMLImageElement.prototype, "complete", "get")
    .mockReturnValue(value);
}

describe("ResolvingImage", () => {
  it("holds a sheen while the photo is in flight, then resolves it in", () => {
    const spy = stubComplete(false);
    render(
      <ResolvingImage
        src="/photo.jpg"
        alt="Lake Tekapo at dusk"
        loadingLabel="Loading image"
        reserveClassName="aspect-video"
      />,
    );

    const sheen = screen.getByRole("status", { name: "Loading image" });
    expect(sheen).toHaveClass("nf-skeleton");
    const img = screen.getByRole("img", { name: "Lake Tekapo at dusk" });
    expect(img).toHaveClass("opacity-0", "blur-sm", "aspect-video");

    fireEvent.load(img);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(img).toHaveClass("opacity-100", "blur-none");
    expect(img).not.toHaveClass("aspect-video");
    expect(img).toHaveClass("motion-reduce:transition-none");
    spy.mockRestore();
  });

  it("never hides a photo that had already settled before it mounted", () => {
    // Server-rendered pages: the image can finish before hydration, when
    // React's onLoad would never fire. It must simply be shown.
    const spy = stubComplete(true);
    render(
      <ResolvingImage
        src="/photo.jpg"
        alt="A hut"
        loadingLabel="Loading image"
      />,
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "A hut" })).toHaveClass(
      "opacity-100",
    );
    spy.mockRestore();
  });

  it("drops the sheen if the photo fails, and still reports the error", () => {
    const spy = stubComplete(false);
    const onError = vi.fn();
    render(
      <ResolvingImage
        src="/missing.jpg"
        alt="Missing"
        loadingLabel="Loading image"
        onError={onError}
      />,
    );
    fireEvent.error(screen.getByRole("img", { name: "Missing" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(onError).toHaveBeenCalledOnce();
    spy.mockRestore();
  });
});
