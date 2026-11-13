import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";

import { MutationQueue } from "@/lib/story/mutation-queue";

// The upload row: every selected photo appears at once, and they go up one
// at a time with a spinner on the active tile -- no "Uploading…" or
// "Processing…" words on screen. beginMediaUploadAction never settles here,
// so the first photo stays mid-upload and the rest stay queued behind it.
const beginMediaUploadAction = vi.fn(() => new Promise<never>(() => {}));

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

describe("ImageUploadManager — the upload row", () => {
  it("lists every selected photo at once and works through them one at a time", async () => {
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

    const row = await screen.findByRole("list", {
      name: "Photos being added",
    });
    await waitFor(() =>
      expect(within(row).getAllByRole("listitem")).toHaveLength(3),
    );

    // Exactly one spinner: the first photo is in flight, the others wait.
    expect(within(row).getAllByRole("status")).toHaveLength(1);
    expect(within(row).getByText(/a\.jpg: Uploading/)).toBeInTheDocument();
    expect(within(row).getByText(/b\.jpg: Waiting/)).toBeInTheDocument();
    expect(within(row).getByText(/c\.jpg: Waiting/)).toBeInTheDocument();
    expect(beginMediaUploadAction).toHaveBeenCalledTimes(1);

    // The state words are for screen readers only, never on screen.
    for (const label of within(row).getAllByText(/: (Uploading|Waiting)/)) {
      expect(label).toHaveClass("sr-only");
    }
  });
});
