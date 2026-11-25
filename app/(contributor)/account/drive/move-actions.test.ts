import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePath = vi.fn();
const revalidateTag = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (p: string) => revalidatePath(p),
  revalidateTag: (tag: string) => revalidateTag(tag),
}));
const dangerouslyDeleteByTag = vi.fn(async () => {});
vi.mock("@vercel/functions", () => ({
  dangerouslyDeleteByTag: () => dangerouslyDeleteByTag(),
  waitUntil: () => {},
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/story/public-queries", () => ({
  PUBLIC_STORIES_TAG: "public-stories",
  PUBLIC_CONTRIBUTORS_TAG: "public-contributors",
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock("@/lib/auth/get-current-user", () => ({
  getCurrentUser: async () => ({ id: "user-1" }),
}));
vi.mock("@/lib/env.server", () => ({ isDriveConfigured: () => true }));
const moveNext = vi.fn();
vi.mock("@/lib/story/media-move", () => ({
  DriveMoveFatalError: class extends Error {},
  beginDriveMoveRun: vi.fn(),
  cleanUpMovedPhotos: vi.fn(),
  finishDriveMoveRun: vi.fn(),
  moveNextPhotoToDrive: () => moveNext(),
}));

import { moveNextDrivePhotoAction } from "./move-actions";

const RUN_ID = "3f0c2a52-6a57-4a0c-9c53-1d1c3c1f2b11";

beforeEach(() => vi.clearAllMocks());

describe("moveNextDrivePhotoAction", () => {
  // A move changes a published photo's address, so the cached story list
  // must refresh; nothing cached under /media can have gone stale.
  it("refreshes the listings but leaves cached photos alone", async () => {
    moveNext.mockResolvedValue({
      done: false,
      outcome: "moved",
      hadPublicCopy: true,
    });
    expect(await moveNextDrivePhotoAction(RUN_ID)).toEqual({
      ok: true,
      done: false,
      moved: true,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(revalidateTag).toHaveBeenCalledWith("public-stories");
    expect(revalidateTag).not.toHaveBeenCalledWith("public-media");
    expect(dangerouslyDeleteByTag).not.toHaveBeenCalled();
  });
});
