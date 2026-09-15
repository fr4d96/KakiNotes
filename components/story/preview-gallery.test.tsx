import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import type { PreviewableMediaItem } from "@/lib/story/contributor-queries";
import { resetPreviewUrlCacheForTests } from "@/lib/story/preview-url-client";

const mintPreviewUrlsAction = vi.fn();

vi.mock("@/app/(contributor)/stories/[id]/media-actions", () => ({
  mintPreviewUrlsAction: (...args: unknown[]) =>
    mintPreviewUrlsAction(...(args as [string[]])),
}));

const { PreviewGallery } = await import("./preview-gallery");

const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";
const ID_C = "33333333-3333-4333-8333-333333333333";
const ID_PROCESSING = "44444444-4444-4444-8444-444444444444";

function mediaItem(
  mediaId: string,
  sortOrder: number,
  processingState: PreviewableMediaItem["processingState"] = "processed",
): PreviewableMediaItem {
  return {
    mediaId,
    sortOrder,
    isCover: false,
    // Non-empty alt text on purpose: an <img alt=""> has an implicit
    // "presentation" role, not "img", which would make
    // findAllByRole("img") come back empty.
    altText: `Photo ${sortOrder}`,
    caption: null,
    decorative: false,
    processingState,
  };
}

describe("PreviewGallery batching", () => {
  beforeEach(() => {
    mintPreviewUrlsAction.mockReset();
    resetPreviewUrlCacheForTests();
  });

  it("mints all ready images in one batched call and skips ids still processing", async () => {
    mintPreviewUrlsAction.mockImplementation(async (ids: string[]) => {
      return Object.fromEntries(ids.map((id) => [id, { url: `blob:${id}` }]));
    });

    render(
      <PreviewGallery
        media={[
          mediaItem(ID_A, 0),
          mediaItem(ID_B, 1),
          mediaItem(ID_C, 2),
          mediaItem(ID_PROCESSING, 3, "processing"),
        ]}
      />,
    );

    const images = await screen.findAllByRole("img");
    expect(images).toHaveLength(3);

    expect(mintPreviewUrlsAction).toHaveBeenCalledTimes(1);
    const requestedIds = mintPreviewUrlsAction.mock.calls[0][0] as string[];
    expect(requestedIds).toEqual(expect.arrayContaining([ID_A, ID_B, ID_C]));
    expect(requestedIds).not.toContain(ID_PROCESSING);
  });
});
