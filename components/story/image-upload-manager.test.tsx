import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";

import { MutationQueue } from "@/lib/story/mutation-queue";
import type { RevisionMediaItem } from "@/lib/story/contributor-queries";
import { PhotoLightboxProvider } from "@/components/ui/photo-lightbox";
import { mintPreviewUrlAction } from "@/app/(contributor)/stories/[id]/media-actions";

// Every Server Action and the browser Supabase client are stubbed: this file
// tests the panel's own rendering rules, not the upload pipeline (which is
// covered by the RLS/e2e suites against a real project).
const updateMediaCaptionAction = vi.fn(async () => ({ ok: true as const }));

vi.mock("@/app/(contributor)/stories/[id]/edit/actions", () => ({
  reorderMediaAction: vi.fn(async () => ({ ok: true })),
  setCoverAction: vi.fn(async () => ({ ok: true })),
  detachMediaAction: vi.fn(async () => ({ ok: true })),
  updateMediaCaptionAction: (...args: unknown[]) =>
    updateMediaCaptionAction(...(args as [])),
}));
vi.mock("@/app/(contributor)/stories/[id]/media-actions", () => ({
  mintPreviewUrlAction: vi.fn(async () => ({ error: "no preview in tests" })),
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

const PLACED_ID = "11111111-1111-4111-8111-111111111111";
const UNPLACED_ID = "22222222-2222-4222-8222-222222222222";

function mediaItem(mediaId: string, sortOrder: number): RevisionMediaItem {
  return {
    mediaId,
    sortOrder,
    isCover: false,
    altText: null,
    caption: null,
    decorative: false,
    processingState: "processed",
    sha256: null,
  };
}

function renderPanel(inlineMediaIds: Set<string>) {
  const versionRef = createRef<number>() as { current: number };
  versionRef.current = 1;
  return render(
    <ImageUploadManager
      storyId="story-1"
      revisionId="revision-1"
      initialMedia={[mediaItem(PLACED_ID, 0), mediaItem(UNPLACED_ID, 1)]}
      versionRef={versionRef}
      queue={new MutationQueue()}
      onVersionBumped={() => {}}
      inlineMediaIds={inlineMediaIds}
    />,
  );
}

/** Opens the detail panel for the nth tile (1-based, as the labels read). */
async function openDetails(index: number) {
  await userEvent.click(
    screen.getByRole("button", { name: new RegExp(`photo ${index}$`) }),
  );
}

describe("ImageUploadManager — the photo library", () => {
  beforeEach(() => {
    updateMediaCaptionAction.mockClear();
  });

  it("summarises the library in one line instead of two groups", () => {
    renderPanel(new Set([PLACED_ID]));
    expect(screen.getByText("2 photos")).toBeInTheDocument();
    expect(screen.getByText(/1 in your story/)).toBeInTheDocument();
  });

  // The point of the redesign: the grid is quiet. The old panel put a
  // checkbox and two text inputs on every tile, so a dozen photos meant
  // three dozen controls and no image you could actually look at.
  it("shows no form fields until a photo's details are opened", async () => {
    renderPanel(new Set());
    expect(screen.queryByLabelText(/^Caption/)).toBeNull();

    await openDetails(1);
    expect(screen.getByLabelText(/^Caption/)).toBeInTheDocument();
  });

  it("opens only one photo's details at a time", async () => {
    renderPanel(new Set());
    await openDetails(1);
    expect(screen.getAllByLabelText(/^Caption/)).toHaveLength(1);
    await openDetails(2);
    expect(screen.getAllByLabelText(/^Caption/)).toHaveLength(1);
  });

  // The gap this closes: placed images used to be filtered out of the panel
  // completely, so captioning a photo after putting it where it belonged was
  // impossible. It must stay true through the redesign.
  it("keeps the caption editable after an image is placed", async () => {
    renderPanel(new Set([PLACED_ID]));
    await openDetails(1);

    const caption = screen.getByLabelText(/^Caption/);
    await userEvent.type(caption, "A vineyard at dawn");
    expect(caption).toHaveValue("A vineyard at dawn");
    expect(updateMediaCaptionAction).toHaveBeenCalled();
  });

  it("shows a placed photo's 'In story' badge", () => {
    renderPanel(new Set([PLACED_ID]));
    expect(screen.getByText("In story")).toBeInTheDocument();
  });

  // One optional field per photo: no separate description, no decorative
  // checkbox. The server derives alt text and "decorative" from the caption,
  // so the client sends the caption alone.
  it("has a single optional caption field and sends only the caption", async () => {
    renderPanel(new Set());
    await openDetails(1);

    expect(screen.queryByLabelText(/Describe this photo/)).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByText("required", { exact: false })).toBeNull();

    await userEvent.type(screen.getByLabelText(/^Caption/), "Hi");
    const lastCall = updateMediaCaptionAction.mock.calls.at(-1) as unknown as [
      Record<string, unknown>,
    ];
    expect(lastCall[0]).toMatchObject({ caption: "Hi" });
    expect(lastCall[0]).not.toHaveProperty("altText");
    expect(lastCall[0]).not.toHaveProperty("decorative");
  });

  it("never nags about photos without a caption", () => {
    renderPanel(new Set());
    expect(screen.queryByText(/need a description/)).toBeNull();
    expect(screen.queryByText("Needs description")).toBeNull();
    expect(
      screen.getAllByRole("button", { name: /^Details photo/ }),
    ).toHaveLength(2);
  });

  it("opens the lightbox on a tile's thumbnail once it has a signed URL", async () => {
    vi.mocked(mintPreviewUrlAction).mockResolvedValue({
      url: "https://example.com/thumb.jpg",
    });
    const versionRef = createRef<number>() as { current: number };
    versionRef.current = 1;
    render(
      <PhotoLightboxProvider>
        <ImageUploadManager
          storyId="story-1"
          revisionId="revision-1"
          initialMedia={[mediaItem(PLACED_ID, 0), mediaItem(UNPLACED_ID, 1)]}
          versionRef={versionRef}
          queue={new MutationQueue()}
          onVersionBumped={() => {}}
          inlineMediaIds={new Set()}
        />
      </PhotoLightboxProvider>,
    );

    const trigger = await screen.findAllByRole("button", {
      name: /^View photo larger/,
    });
    await userEvent.click(trigger[0]);

    const dialog = document.querySelector("dialog");
    expect(dialog).toHaveAttribute("open");
    expect(dialog?.querySelector("img")).toHaveAttribute(
      "src",
      "https://example.com/thumb.jpg",
    );
  });
});
