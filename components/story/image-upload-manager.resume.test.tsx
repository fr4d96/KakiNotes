import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";

import { MutationQueue } from "@/lib/story/mutation-queue";

// The screen locking mid-upload (Supabase path): the one POST carrying the
// photo dies with a network error. The upload waits, sends it again, and an
// "already exists" answer on that retry counts as success -- it is this same
// photo, from the attempt the lock cut off.
const finalizeMediaUploadAction = vi.fn(async () => ({ version: 2 }));

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
  beginMediaUploadAction: vi.fn(async () => ({
    mediaId: "media-1",
    reservedPath: "user/revision/media-1.jpg",
  })),
  finalizeMediaUploadAction: () => finalizeMediaUploadAction(),
  transcodeHeicUploadAction: vi.fn(async () => ({ error: "not used" })),
}));
vi.mock("@/app/(contributor)/stories/[id]/edit/drive-upload-actions", () => ({
  getStoryMediaUploadModeAction: vi.fn(async () => "supabase"),
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({
        data: { session: { access_token: "test-token" } },
      }),
    },
  }),
}));

const { ImageUploadManager } = await import("./image-upload-manager");

describe("ImageUploadManager — upload survives a screen lock", () => {
  it("re-sends the photo after a network failure and accepts the duplicate", async () => {
    URL.createObjectURL = vi.fn(() => "blob:preview");
    URL.revokeObjectURL = vi.fn();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Load failed"))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            statusCode: "409",
            error: "Duplicate",
            message: "The resource already exists",
          }),
          { status: 400 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const versionRef = createRef<number>() as { current: number };
    versionRef.current = 1;
    const { container } = render(
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
    await userEvent.upload(
      container.querySelector<HTMLInputElement>("#story-image-upload")!,
      new File(["x"], "a.jpg", { type: "image/jpeg" }),
    );

    await waitFor(() => expect(finalizeMediaUploadAction).toHaveBeenCalled(), {
      timeout: 4000,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(versionRef.current).toBe(2);
    vi.unstubAllGlobals();
  });
});
