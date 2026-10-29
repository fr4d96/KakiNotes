// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/story/image-pipeline", () => ({
  mintMediaPreviewSignedUrls: vi.fn(),
}));

import { groupPhotosByStory } from "@/lib/story/my-photos";

function row(
  mediaId: string,
  storyId: string,
  overrides: Partial<Parameters<typeof groupPhotosByStory>[0][number]> = {},
) {
  return {
    media_id: mediaId,
    story_id: storyId,
    story_title: `Story ${storyId}`,
    lifecycle_status: "draft",
    storage_backend: "supabase",
    alt_text: null,
    caption: null,
    processed_width: 1500,
    processed_height: 2000,
    in_current_version: true,
    ...overrides,
  };
}

describe("groupPhotosByStory", () => {
  it("keeps the RPC's order: stories in first-seen order, photos in display order", () => {
    const stories = groupPhotosByStory(
      [row("m1", "s1"), row("m2", "s1"), row("m3", "s2"), row("m4", "s1")],
      () => null,
    );
    expect(stories.map((s) => s.storyId)).toEqual(["s1", "s2"]);
    expect(stories[0].photos.map((p) => p.mediaId)).toEqual(["m1", "m2", "m4"]);
    expect(stories[1].photos.map((p) => p.mediaId)).toEqual(["m3"]);
  });

  it("asks for each photo's thumbnail with its backend, and treats anything unknown as Kakinotes", () => {
    const seen: string[] = [];
    const stories = groupPhotosByStory(
      [
        row("m1", "s1", { storage_backend: "google_drive" }),
        row("m2", "s1", { storage_backend: "something-new" }),
      ],
      (id, backend) => {
        seen.push(`${id}:${backend}`);
        return backend === "google_drive" ? `/media/${id}` : null;
      },
    );
    expect(seen).toEqual(["m1:google_drive", "m2:supabase"]);
    expect(stories[0].photos[0].thumbnailUrl).toBe("/media/m1");
    expect(stories[0].photos[1].storageBackend).toBe("supabase");
  });

  it("carries the story's title and status from its first row", () => {
    const [story] = groupPhotosByStory(
      [row("m1", "s1", { story_title: null, lifecycle_status: "published" })],
      () => null,
    );
    expect(story.title).toBeNull();
    expect(story.lifecycleStatus).toBe("published");
  });
});
