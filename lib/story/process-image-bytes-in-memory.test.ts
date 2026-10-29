// @vitest-environment node
//
// server-only's package code throws unconditionally outside Next's own
// bundler — same mocking convention as image-pipeline.test.ts/heic.test.ts.
// Separate file from image-pipeline.test.ts (which predates
// processImageBytesInMemory and has its own large fixture/mocking setup)
// so this one stays focused and nothing here risks touching that file.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// processImageBytesInMemory() never touches the admin client or raw-HTTP
// storage helpers directly, but image-pipeline.ts's top-level imports
// still reach lib/supabase/admin.ts and lib/env.server.ts — mocked so
// importing the module doesn't require real Supabase credentials.
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/env.server", () => ({
  env: { NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co" },
  getAdminEnv: () => ({ SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key" }),
}));

const { processImageBytesInMemory } = await import("./image-pipeline");

const heicFixture = readFileSync(
  path.join(__dirname, "__fixtures__", "sample.heic"),
);

describe("processImageBytesInMemory", () => {
  // Round B: confirms the fix for a real gap — Drive-mode uploads have no
  // separate HEIC-transcode step the way the Supabase path does
  // (transcodeHeicUploadAction runs BEFORE processStoryMedia ever sees the
  // bytes), so this function has to transcode HEIC itself, first.
  it("transcodes a real HEIC source to a processed JPEG derivative", async () => {
    const result = await processImageBytesInMemory(heicFixture);

    expect(result.processedMimeType).toBe("image/jpeg");
    // Matches the Supabase path's own recorded behavior: source_mime_type
    // ends up "image/jpeg" post-transcode, not "image/heic" — see
    // processStoryMedia()/record_processed_story_media().
    expect(result.sourceMimeType).toBe("image/jpeg");
    expect(result.sourceWidth).toBeGreaterThan(0);
    expect(result.sourceHeight).toBeGreaterThan(0);
    expect(result.bytes.byteLength).toBeGreaterThan(0);
    // A genuine JPEG signature (0xFFD8FF), proving a real re-encode
    // happened, not just a renamed copy of the HEIC bytes.
    expect(result.bytes[0]).toBe(0xff);
    expect(result.bytes[1]).toBe(0xd8);
  });

  it("rejects bytes that are neither a stored image format nor HEIC", async () => {
    await expect(
      processImageBytesInMemory(Buffer.from("not an image")),
    ).rejects.toThrow("unrecognized_image_format");
  });
});
