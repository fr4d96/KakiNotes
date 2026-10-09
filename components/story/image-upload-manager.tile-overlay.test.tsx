import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MutationQueue } from "@/lib/story/mutation-queue";
import type { RevisionMediaItem } from "@/lib/story/contributor-queries";
import { PhotoLightboxProvider } from "@/components/ui/photo-lightbox";

// Task #5: Details sits ON the photo (shown on hover / focus / touch) and a
// zoom icon is always in the top-right corner of a loaded photo. Opacity is
// CSS, which jsdom doesn't apply, so these tests assert on the classes that
// decide it and on what is (and isn't) in the accessibility tree.
const READY = "11111111-1111-4111-8111-111111111111";
const FAILED = "22222222-2222-4222-8222-222222222222";

vi.mock("@/app/(contributor)/stories/[id]/edit/actions", () => ({
  reorderMediaAction: vi.fn(async () => ({ ok: true })),
  setCoverAction: vi.fn(async () => ({ ok: true })),
  detachMediaAction: vi.fn(async () => ({ ok: true })),
  updateMediaCaptionAction: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/app/(contributor)/stories/[id]/media-actions", () => ({
  mintPreviewUrlAction: vi.fn(async (mediaId: string) =>
    mediaId === READY
      ? { url: "https://example.test/ready.jpg" }
      : { error: "no preview" },
  ),
  refreshMediaAction: vi.fn(async () => ({ error: "no refresh in tests" })),
}));
vi.mock("@/app/(contributor)/stories/[id]/edit/upload-actions", () => ({
  beginMediaUploadAction: vi.fn(async () => ({ error: "not used" })),
  finalizeMediaUploadAction: vi.fn(async () => ({ error: "not used" })),
  transcodeHeicUploadAction: vi.fn(async () => ({ error: "not used" })),
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getSession: async () => ({ data: { session: null } }) },
  }),
}));

const { ImageUploadManager } = await import("./image-upload-manager");

function mediaItem(
  mediaId: string,
  sortOrder: number,
  processingState = "processed",
): RevisionMediaItem {
  return {
    mediaId,
    sortOrder,
    isCover: false,
    altText: null,
    caption: null,
    decorative: false,
    processingState,
    sha256: null,
  };
}

function renderPanel(media: RevisionMediaItem[]) {
  const versionRef = createRef<number>() as { current: number };
  versionRef.current = 1;
  return render(
    <PhotoLightboxProvider>
      <ImageUploadManager
        storyId="story-1"
        revisionId="revision-1"
        initialMedia={media}
        versionRef={versionRef}
        queue={new MutationQueue()}
        onVersionBumped={() => {}}
        inlineMediaIds={new Set()}
      />
    </PhotoLightboxProvider>,
  );
}

// alt="" makes the thumbnail role="presentation", so wait for the element.
async function photoLoaded(container: HTMLElement) {
  await waitFor(() =>
    expect(container.querySelector(".js-image-thumb img")).not.toBeNull(),
  );
}

const thumbOf = (button: HTMLElement) => button.closest(".js-image-thumb")!;

describe("ImageUploadManager — photo tile overlay", () => {
  it("puts Details on the photo itself, hidden until hover/focus on a loaded photo, always shown on touch", async () => {
    const { container } = renderPanel([mediaItem(READY, 0)]);
    await photoLoaded(container);

    const details = screen.getByRole("button", { name: /photo 1$/ });
    expect(thumbOf(details)).not.toBeNull();
    expect(details.className).toContain("opacity-0");
    expect(details.className).toContain("group-hover/tile:opacity-100");
    expect(details.className).toContain("focus-visible:opacity-100");
    expect(details.className).toContain("[@media(hover:none)]:opacity-100");
  });

  it("always shows the zoom icon on a loaded photo, hidden from screen readers", async () => {
    const { container } = renderPanel([mediaItem(READY, 0)]);
    await photoLoaded(container);

    const icon = container.querySelector(".js-image-thumb span[aria-hidden]");
    expect(icon).not.toBeNull();
    expect(icon!.querySelector("svg")).not.toBeNull();
    // Click-through: the photo underneath is the lightbox button.
    expect(icon!.className).toContain("pointer-events-none");
  });

  it("keeps Details visible, and shows no zoom icon, when there's no photo to look at", () => {
    const { container } = renderPanel([mediaItem(FAILED, 0, "failed")]);

    const details = screen.getByRole("button", { name: /photo 1$/ });
    expect(details.className).toContain("opacity-100");
    expect(details.className).not.toMatch(/(^|\s)opacity-0(\s|$)/);
    expect(
      container.querySelector(".js-image-thumb span[aria-hidden]"),
    ).toBeNull();
  });

  it("still opens Details from the overlay button", async () => {
    const { container } = renderPanel([mediaItem(READY, 0)]);
    await photoLoaded(container);

    await userEvent.click(screen.getByRole("button", { name: /photo 1$/ }));
    expect(screen.getByLabelText(/^Caption/)).toBeInTheDocument();
    // The overlay button is gone while the panel is open (Done closes it).
    expect(screen.queryByRole("button", { name: /photo 1$/ })).toBeNull();
  });
});
