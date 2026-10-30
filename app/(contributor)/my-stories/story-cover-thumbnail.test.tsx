import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { mintMock } = vi.hoisted(() => ({
  mintMock: vi.fn(async (mediaId: string) => ({
    url: `https://example.test/signed/${mediaId}.jpg`,
  })),
}));
vi.mock("@/app/(contributor)/stories/[id]/media-actions", () => ({
  mintPreviewUrlAction: mintMock,
}));

import { StoryCoverThumbnail } from "./story-cover-thumbnail";

describe("StoryCoverThumbnail", () => {
  it("holds a shimmer, not a spinner, until the photo itself has loaded", async () => {
    // A mediaId no other test uses, so the module-level URL cache is cold.
    render(<StoryCoverThumbnail mediaId="cover-a" altText="A red van" />);

    const shimmer = screen.getByRole("status", { name: "Loading image" });
    expect(shimmer).toHaveClass("nf-skeleton");
    expect(shimmer.querySelector("svg")).toBeNull();

    // The URL arrives first; the shimmer stays while the bytes download.
    const img = await screen.findByRole("img", { name: "A red van" });
    expect(img).toHaveAttribute(
      "src",
      "https://example.test/signed/cover-a.jpg",
    );
    expect(img).toHaveClass("opacity-0");
    expect(
      screen.getByRole("status", { name: "Loading image" }),
    ).toBeInTheDocument();

    fireEvent.load(img);

    expect(
      screen.queryByRole("status", { name: "Loading image" }),
    ).not.toBeInTheDocument();
    expect(img).toHaveClass("opacity-100");
    // Fills its frame, cropped rather than letterboxed.
    expect(img).toHaveClass("h-full", "w-full", "object-cover");
    // The resolve motion collapses for reduced-motion users.
    expect(img).toHaveClass("motion-reduce:transition-none");
  });

  it("shows the story cover fallback when there is no cover at all", () => {
    render(<StoryCoverThumbnail mediaId={null} altText={null} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(mintMock).not.toHaveBeenCalledWith(null);
  });
});
