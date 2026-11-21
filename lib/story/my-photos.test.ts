// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/story/image-pipeline", () => ({
  mintMediaPreviewSignedUrls: vi.fn(),
}));
vi.mock("@/lib/story/contributor-queries", () => ({
  listMyStories: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { mintMediaPreviewSignedUrls } from "@/lib/story/image-pipeline";
import { listMyStories } from "@/lib/story/contributor-queries";
import {
  groupPhotosByStory,
  listMyPhotos,
  rowsInCountry,
} from "@/lib/story/my-photos";

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

describe("rowsInCountry", () => {
  const countries = new Map<string, string | null>([
    ["nz", "new-zealand"],
    ["cn", "china"],
    ["legacy", null],
  ]);
  const rows = [
    row("m1", "nz"),
    row("m2", "cn"),
    row("m3", "legacy"),
    row("m4", "unknown"),
  ];

  it("keeps only the chosen country's stories", () => {
    expect(
      rowsInCountry(rows, countries, "china").map((r) => r.media_id),
    ).toEqual(["m2"]);
  });

  it("counts a story with no country (or not listed) as New Zealand", () => {
    expect(
      rowsInCountry(rows, countries, "new-zealand").map((r) => r.media_id),
    ).toEqual(["m1", "m3", "m4"]);
  });
});

describe("listMyPhotos", () => {
  function setup() {
    vi.mocked(createClient).mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({
        data: [row("m1", "nz"), row("m2", "cn"), row("m3", "nz")],
        error: null,
      }),
    } as never);
    vi.mocked(listMyStories).mockResolvedValue([
      { id: "nz", country_slug: "new-zealand" },
      { id: "cn", country_slug: "china" },
    ] as never);
    vi.mocked(mintMediaPreviewSignedUrls).mockImplementation(async (ids) =>
      Object.fromEntries(ids.map((id) => [id, `signed:${id}`])),
    );
  }

  it("under China lists only China stories and mints only their thumbnails", async () => {
    setup();
    const stories = await listMyPhotos({
      driveConnected: false,
      countrySlug: "china",
    });
    expect(stories.map((s) => s.storyId)).toEqual(["cn"]);
    expect(mintMediaPreviewSignedUrls).toHaveBeenLastCalledWith(
      ["m2"],
      expect.any(Number),
    );
  });

  it("under New Zealand still lists the New Zealand stories", async () => {
    setup();
    const stories = await listMyPhotos({
      driveConnected: false,
      countrySlug: "new-zealand",
    });
    expect(stories.map((s) => s.storyId)).toEqual(["nz"]);
    expect(stories[0].photos.map((p) => p.thumbnailUrl)).toEqual([
      "signed:m1",
      "signed:m3",
    ]);
  });

  it("is empty when the chosen country has no stories", async () => {
    setup();
    vi.mocked(listMyStories).mockResolvedValue([
      { id: "nz", country_slug: "new-zealand" },
      { id: "cn", country_slug: "new-zealand" },
    ] as never);
    expect(
      await listMyPhotos({ driveConnected: false, countrySlug: "china" }),
    ).toEqual([]);
  });
});
