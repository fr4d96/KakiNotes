import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockGetCurrentUser = vi.fn();
vi.mock("@/lib/auth/get-current-user", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

const mockRpc = vi.fn();
const mockFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

import { storyVersionForMedia } from "./mutations";

const user = { id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" };
const mediaId = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  mockGetCurrentUser.mockReset();
  mockGetCurrentUser.mockResolvedValue(user);
  mockRpc.mockReset();
  mockFrom.mockReset();
});

// BUG (round 2): storyVersionForMedia used to read story_media/stories
// directly via supabase.from(...) through the ordinary RLS-respecting
// client. Both tables have had EVERY privilege revoked from `authenticated`
// since supabase/migrations/20260803090900_lock_down_story_domain_grants.sql
// -- "no policies, every access via a SECURITY DEFINER function" is
// enforced at the grant level, not just via RLS -- so every call ALWAYS
// failed in the real dev project with "permission denied for table
// story_media", was swallowed, and returned null.
//
// That silent failure was the actual cause of the reported cascade: after a
// successful image upload, finalize_story_media_upload() had already
// bumped stories.version in the database, but finalizeMediaUploadAction's
// post-success call to this function always returned null, so the client's
// versionRef never advanced to match. The very next mutation on that story
// (a second image's finalize, an autosave, a tags/locations save) then sent
// the client's one-behind version and was rejected as "stale" -- forever,
// since nothing re-synced it.
//
// Fixed by routing through get_story_version_for_media() (supabase/
// migrations/20260926110809_get_story_version_for_media.sql), a proper
// SECURITY DEFINER accessor, instead of a direct table read.
describe("storyVersionForMedia", () => {
  it("reads the version through get_story_version_for_media(), never a direct table query", async () => {
    mockRpc.mockResolvedValue({ data: 36, error: null });

    const version = await storyVersionForMedia(mediaId);

    expect(version).toBe(36);
    expect(mockRpc).toHaveBeenCalledWith("get_story_version_for_media", {
      p_media_id: mediaId,
    });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("returns null (not a thrown error) when the RPC itself is refused", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "permission denied for table story_media" },
    });

    const version = await storyVersionForMedia(mediaId);

    expect(version).toBeNull();
  });
});
