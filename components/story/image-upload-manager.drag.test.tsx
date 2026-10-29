import { createElement, createRef, type ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DragEndEvent } from "@dnd-kit/core";

import { MutationQueue } from "@/lib/story/mutation-queue";
import type { RevisionMediaItem } from "@/lib/story/contributor-queries";

// jsdom has no layout, so a real pointer drag can't be simulated here (it is
// checked in the browser instead). These tests capture the onDragEnd the
// grid hands to DndContext and drive it directly -- what matters in this
// file is what a drop does to the order and what gets saved.
const captured = vi.hoisted(() => ({
  onDragEnd: null as ((event: DragEndEvent) => void) | null,
}));
vi.mock("@dnd-kit/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dnd-kit/core")>();
  return {
    ...actual,
    DndContext: (props: ComponentProps<typeof actual.DndContext>) => {
      captured.onDragEnd = props.onDragEnd ?? null;
      return createElement(actual.DndContext, props);
    },
  };
});

const reorderMediaAction = vi.hoisted(() =>
  vi.fn(async (..._args: unknown[]) => ({ ok: true as const })),
);
vi.mock("@/app/(contributor)/stories/[id]/edit/actions", () => ({
  reorderMediaAction,
  setCoverAction: vi.fn(async () => ({ ok: true })),
  detachMediaAction: vi.fn(async () => ({ ok: true })),
  updateMediaCaptionAction: vi.fn(async () => ({ ok: true })),
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

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

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

function renderPanel(ids: string[]) {
  const versionRef = createRef<number>() as { current: number };
  versionRef.current = 1;
  const onVersionBumped = vi.fn();
  render(
    <ImageUploadManager
      storyId="44444444-4444-4444-8444-444444444444"
      revisionId="revision-1"
      initialMedia={ids.map((id, i) => mediaItem(id, i))}
      versionRef={versionRef}
      queue={new MutationQueue()}
      onVersionBumped={onVersionBumped}
      inlineMediaIds={new Set()}
    />,
  );
  return { versionRef, onVersionBumped };
}

function drop(activeId: string, overId: string | null) {
  act(() => {
    captured.onDragEnd!({
      active: { id: activeId },
      over: overId ? { id: overId } : null,
    } as unknown as DragEndEvent);
  });
}

beforeEach(() => {
  captured.onDragEnd = null;
  reorderMediaAction.mockClear();
});

describe("ImageUploadManager — drag to reorder", () => {
  it("moves the dragged photo to where it was dropped and saves the whole new order", async () => {
    const { versionRef, onVersionBumped } = renderPanel([A, B, C]);

    drop(A, C);

    await waitFor(() => expect(reorderMediaAction).toHaveBeenCalledTimes(1));
    // Moved, not swapped: A lands last and B/C shift up one place.
    expect(reorderMediaAction).toHaveBeenCalledWith(
      "revision-1",
      1,
      [B, C, A],
      "44444444-4444-4444-8444-444444444444",
    );
    await waitFor(() => expect(onVersionBumped).toHaveBeenCalled());
    expect(versionRef.current).toBe(2);
  });

  it("saves nothing when a photo is dropped back on itself or outside the grid", async () => {
    renderPanel([A, B, C]);

    drop(B, B);
    drop(B, null);

    // Give the queue a chance to run anything it was (wrongly) given.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(reorderMediaAction).not.toHaveBeenCalled();
  });

  it("uses each drop's result as the starting point for the next one", async () => {
    renderPanel([A, B, C]);

    drop(C, A);
    await waitFor(() => expect(reorderMediaAction).toHaveBeenCalledTimes(1));
    drop(A, B);

    await waitFor(() => expect(reorderMediaAction).toHaveBeenCalledTimes(2));
    expect(reorderMediaAction.mock.calls[0][2]).toEqual([C, A, B]);
    expect(reorderMediaAction.mock.calls[1][2]).toEqual([C, B, A]);
  });

  it("explains dragging when there is something to reorder, and hides it while details are open", async () => {
    renderPanel([A, B]);
    expect(
      screen.getByText(/drag a photo to change its place/i, { selector: "p" }),
    ).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: /photo 1$/ }));
    expect(
      screen.queryByText(/drag a photo to change its place/i, {
        selector: "p",
      }),
    ).toBeNull();
  });

  it("doesn't offer dragging for a single photo", () => {
    renderPanel([A]);
    expect(
      screen.queryByText(/drag a photo to change its place/i, {
        selector: "p",
      }),
    ).toBeNull();
  });
});
