import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";

import { MutationQueue } from "@/lib/story/mutation-queue";

// The upload queue: every selected photo appears at once as a tile at the
// end of the photo grid, and they go up one at a time with a spinner on the
// active tile -- no "Uploading…" or "Processing…" words on screen. A photo
// leaves the queue the moment it is done with, failed or not.
//
// beginMediaUploadAction fails the first photo, then never settles, so the
// second photo stays mid-upload and the third stays queued behind it.
const beginMediaUploadAction = vi
  .fn<() => Promise<{ error: string }>>()
  .mockResolvedValueOnce({ error: "That file could not be read." })
  .mockImplementation(() => new Promise<never>(() => {}));

vi.mock("@/app/(contributor)/stories/[id]/edit/actions", () => ({
  reorderMediaAction: vi.fn(async () => ({ ok: true })),
  setCoverAction: vi.fn(async () => ({ ok: true })),
  detachMediaAction: vi.fn(async () => ({ ok: true })),
  updateMediaCaptionAction: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/app/(contributor)/stories/[id]/media-actions", () => ({
  mintPreviewUrlAction: vi.fn(async () => ({ error: "no preview in tests" })),
  refreshMediaAction: vi.fn(async () => ({ error: "no refresh in tests" })),
}));
vi.mock("@/app/(contributor)/stories/[id]/edit/upload-actions", () => ({
  beginMediaUploadAction: () => beginMediaUploadAction(),
  finalizeMediaUploadAction: vi.fn(async () => ({ error: "not used" })),
  transcodeHeicUploadAction: vi.fn(async () => ({ error: "not used" })),
}));
vi.mock("@/app/(contributor)/stories/[id]/edit/drive-upload-actions", () => ({
  getStoryMediaUploadModeAction: vi.fn(async () => "supabase"),
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getSession: async () => ({ data: { session: null } }) },
  }),
}));

const { ImageUploadManager } = await import("./image-upload-manager");

function renderPanel() {
  const versionRef = createRef<number>() as { current: number };
  versionRef.current = 1;
  return render(
    <ImageUploadManager
      storyId="story-1"
      revisionId="revision-1"
      initialMedia={[]}
      versionRef={versionRef}
      queue={new MutationQueue()}
      onVersionBumped={() => {}}
      inlineMediaIds={new Set()}
    />,
  );
}

function jpeg(name: string) {
  return new File(["x"], name, { type: "image/jpeg" });
}

describe("ImageUploadManager — the upload queue", () => {
  it("shows the batch as grid tiles, works through them one at a time, and drops a failed one at once", async () => {
    URL.createObjectURL = vi.fn(() => "blob:preview");
    URL.revokeObjectURL = vi.fn();
    const { container } = renderPanel();

    const input = container.querySelector<HTMLInputElement>(
      "#story-image-upload",
    )!;
    await userEvent.upload(input, [
      jpeg("a.jpg"),
      jpeg("b.jpg"),
      jpeg("c.jpg"),
    ]);

    // a.jpg failed: gone from the queue, not left behind with a red border.
    await waitFor(() =>
      expect(
        container.querySelectorAll("[data-upload-queue-item]"),
      ).toHaveLength(2),
    );
    expect(screen.queryByText(/a\.jpg:/)).toBeNull();

    // Exactly one spinner: b is in flight, c waits.
    const tiles = [
      ...container.querySelectorAll<HTMLElement>("[data-upload-queue-item]"),
    ];
    expect(
      tiles.flatMap((tile) => within(tile).queryAllByRole("status")),
    ).toHaveLength(1);
    expect(screen.getByText(/b\.jpg: Uploading/)).toHaveClass("sr-only");
    expect(screen.getByText(/c\.jpg: Waiting/)).toHaveClass("sr-only");
    expect(beginMediaUploadAction).toHaveBeenCalledTimes(2);

    // The queue lives inside the photo grid, not in a separate row above it.
    const grid = tiles[0].closest("ul")!;
    expect(grid).toHaveClass("grid");
  });
});
