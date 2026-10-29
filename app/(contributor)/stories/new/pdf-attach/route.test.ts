// @vitest-environment node
//
// Contributor-facing twin of
// app/(editor)/editorial/new/pdf-attach/route.test.ts -- same in-memory fake
// of the media-upload RPCs, trimmed to this route's own shape: no
// contributor-selection fields (create_self_service_draft, not
// create_editorial_import_draft) and no editor/admin role gate. Focused on
// this route's own wiring (country pass-through/validation) rather than
// re-proving the shared PDF-attach pipeline, which the editorial test
// already covers in depth.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

type FakeMediaRow = {
  id: string;
  storyId: string;
  reservedForRevisionId: string;
  processingState: "pending_upload" | "uploaded" | "processed" | "failed";
  sha256: string | null;
};
type FakeRevisionMediaRow = {
  revisionId: string;
  mediaId: string;
  sortOrder: number;
  decorative: boolean;
  altText: string | null;
};
type FakeStory = {
  id: string;
  revisionId: string;
  title: string;
  contentJson: unknown;
  version: number;
};

let mediaRows: Map<string, FakeMediaRow>;
let revisionMediaRows: FakeRevisionMediaRow[];
let stories: Map<string, FakeStory>;
let revisionToStory: Map<string, string>;
let mediaIdCounter: number;
let storyIdCounter: number;
let currentUser: { id: string } | null;
const objects = new Map<string, Buffer>();

function resetFakeDb() {
  mediaRows = new Map();
  revisionMediaRows = [];
  stories = new Map();
  revisionToStory = new Map();
  mediaIdCounter = 0;
  storyIdCounter = 0;
  currentUser = { id: "contributor-1" };
  objects.clear();
}
resetFakeDb();

const fakeSupabase = {
  auth: {
    getSession: async () => {
      if (!currentUser) return { data: { session: null } };
      return { data: { session: { access_token: "test-access-token" } } };
    },
  },
  rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
    switch (name) {
      case "create_self_service_draft": {
        const countrySlug = (args.p_country_slug as string) ?? "new-zealand";
        if (!["new-zealand", "china"].includes(countrySlug)) {
          return {
            data: null,
            error: new Error(`Unknown country: ${countrySlug}`),
          };
        }
        storyIdCounter += 1;
        mediaIdCounter += 1;
        const storyId = `story-${storyIdCounter}`;
        const revisionId = `revision-${storyIdCounter}`;
        stories.set(storyId, {
          id: storyId,
          revisionId,
          title: args.p_title as string,
          contentJson: args.p_content_json ?? [],
          version: 1,
        });
        revisionToStory.set(revisionId, storyId);
        return {
          data: [{ story_id: storyId, revision_id: revisionId }],
          error: null,
        };
      }
      case "begin_story_media_upload": {
        const revisionId = args.p_revision_id as string;
        mediaIdCounter += 1;
        const id = `00000000-0000-4000-8000-${String(mediaIdCounter).padStart(12, "0")}`;
        const storyId = revisionToStory.get(revisionId)!;
        mediaRows.set(id, {
          id,
          storyId,
          reservedForRevisionId: revisionId,
          processingState: "pending_upload",
          sha256: null,
        });
        return {
          data: [
            { media_id: id, reserved_path: `${storyId}/${id}/original.png` },
          ],
          error: null,
        };
      }
      case "finalize_story_media_upload": {
        const mediaId = args.p_media_id as string;
        const media = mediaRows.get(mediaId);
        if (!media) return { data: null, error: new Error("no such media") };
        const storyId = media.storyId;
        const story = stories.get(storyId)!;
        const expectedVersion = args.p_expected_version as number;
        if (expectedVersion !== story.version) {
          return { data: null, error: new Error("stale version") };
        }
        const nextSort =
          Math.max(
            -1,
            ...revisionMediaRows
              .filter((r) => r.revisionId === media.reservedForRevisionId)
              .map((r) => r.sortOrder),
          ) + 1;
        revisionMediaRows.push({
          revisionId: media.reservedForRevisionId,
          mediaId,
          sortOrder: nextSort,
          decorative: true,
          altText: null,
        });
        media.processingState = "uploaded";
        story.version += 1;
        return { data: null, error: null };
      }
      case "cancel_pending_story_media_upload": {
        const mediaId = args.p_media_id as string;
        mediaRows.delete(mediaId);
        return { data: null, error: null };
      }
      case "detach_story_media": {
        const revisionId = args.p_revision_id as string;
        const mediaId = args.p_media_id as string;
        revisionMediaRows = revisionMediaRows.filter(
          (r) => !(r.revisionId === revisionId && r.mediaId === mediaId),
        );
        const storyId = revisionToStory.get(revisionId);
        if (storyId) stories.get(storyId)!.version += 1;
        return { data: null, error: null };
      }
      case "get_story_preview": {
        const storyId = args.p_story_id as string;
        const story = stories.get(storyId);
        if (!story) return { data: [], error: null };
        const rows = revisionMediaRows
          .filter((r) => r.revisionId === story.revisionId)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((r) => {
            const media = mediaRows.get(r.mediaId)!;
            return {
              mediaId: r.mediaId,
              sortOrder: r.sortOrder,
              isCover: false,
              altText: r.altText,
              caption: null,
              decorative: r.decorative,
              processingState: media.processingState,
              sha256: media.sha256,
            };
          });
        return {
          data: [
            {
              story_id: story.id,
              title: story.title,
              excerpt: null,
              content_json: story.contentJson,
              trip_start_date: null,
              trip_end_date: null,
              trip_year: null,
              travel_style: null,
              total_expense_nzd_cents: null,
              source_kind: "self_submitted",
              lifecycle_status: "draft",
              revision_id: story.revisionId,
              revision_status: "draft",
              version: story.version,
              attribution_type: "display_name",
              attribution_value: "Test Contributor",
              viewer_relationship: "owner",
              media: rows,
            },
          ],
          error: null,
        };
      }
      case "record_processed_story_media": {
        const mediaId = args.p_media_id as string;
        const media = mediaRows.get(mediaId);
        if (media) {
          media.processingState = "processed";
          media.sha256 = args.p_sha256 as string;
        }
        return { data: null, error: null };
      }
      case "record_story_media_processing_failed": {
        const mediaId = args.p_media_id as string;
        const media = mediaRows.get(mediaId);
        if (media) media.processingState = "failed";
        return { data: null, error: null };
      }
      case "update_story_media_caption": {
        const revisionId = args.p_revision_id as string;
        const mediaId = args.p_media_id as string;
        const storyId = revisionToStory.get(revisionId);
        if (!storyId)
          return { data: null, error: new Error("no such revision") };
        const story = stories.get(storyId)!;
        const expectedVersion = args.p_expected_version as number;
        if (expectedVersion !== story.version) {
          return { data: null, error: new Error("stale version") };
        }
        const row = revisionMediaRows.find(
          (r) => r.revisionId === revisionId && r.mediaId === mediaId,
        );
        if (!row) return { data: null, error: new Error("no such media") };
        row.altText = args.p_alt_text as string | null;
        row.decorative = Boolean(args.p_decorative);
        story.version += 1;
        return { data: null, error: null };
      }
      case "save_revision_draft": {
        const revisionId = args.p_revision_id as string;
        const storyId = revisionToStory.get(revisionId);
        if (!storyId)
          return { data: null, error: new Error("no such revision") };
        const story = stories.get(storyId)!;
        const expectedVersion = args.p_expected_version as number;
        if (expectedVersion !== story.version) {
          return { data: null, error: new Error("stale version") };
        }
        story.title = args.p_title as string;
        story.contentJson = args.p_content_json;
        story.version += 1;
        return { data: story.version, error: null };
      }
      default:
        throw new Error(`Unmocked RPC in test fake: ${name}`);
    }
  }),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => fakeSupabase,
}));

vi.mock("@/lib/auth/get-current-user", () => ({
  getCurrentUser: async () => currentUser,
}));

const fakeAdmin = {
  from: () => ({
    select: () => ({
      eq: (_col: string, id: string) => ({
        single: async () => {
          const media = mediaRows.get(id);
          if (!media) return { data: null, error: new Error("not found") };
          return {
            data: {
              story_id: media.storyId,
              private_storage_path: `${media.storyId}/${media.id}/original.png`,
              processing_state: media.processingState,
            },
            error: null,
          };
        },
      }),
    }),
  }),
  storage: {
    from: () => ({
      list: async () => ({ data: [] }),
      createSignedUrl: async () => ({
        data: { signedUrl: "https://example.com/signed" },
        error: null,
      }),
    }),
  },
  rpc: (name: string, args: Record<string, unknown>) =>
    fakeSupabase.rpc(name, args),
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => fakeAdmin,
}));

vi.mock("@/lib/env.server", () => ({
  env: {
    NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
  },
  getAdminEnv: () => ({ SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key" }),
}));

vi.mock("@/lib/story/raw-storage-http", () => ({
  rawStorageDownload: async (
    _url: string,
    _auth: unknown,
    bucket: string,
    p: string,
  ) => {
    const buf = objects.get(`${bucket}/${p}`);
    if (!buf) throw new Error("not found");
    return buf;
  },
  rawStorageUpload: async (
    _url: string,
    _auth: unknown,
    bucket: string,
    p: string,
    bytes: Buffer,
  ) => {
    objects.set(`${bucket}/${p}`, Buffer.from(bytes));
  },
}));

const FIXTURES_DIR = path.join(process.cwd(), "lib", "story", "__fixtures__");
async function fixture(name: string): Promise<Buffer> {
  return readFile(path.join(FIXTURES_DIR, name));
}

function requestWithFields(
  bytes: Buffer,
  fields: Record<string, string>,
  filename = "My Trip.pdf",
): NextRequest {
  const formData = new FormData();
  formData.append(
    "file",
    new File([new Uint8Array(bytes)], filename, { type: "application/pdf" }),
  );
  for (const [key, value] of Object.entries(fields)) {
    formData.append(key, value);
  }
  return new NextRequest("http://localhost/stories/new/pdf-attach", {
    method: "POST",
    body: formData,
  });
}

function baseFields(pageNumbers: number[], title = "My Trip") {
  return {
    title,
    pageNumbers: JSON.stringify(pageNumbers),
  };
}

beforeEach(() => {
  resetFakeDb();
  fakeSupabase.rpc.mockClear();
});

describe("POST /stories/new/pdf-attach", () => {
  it("rejects a signed-out caller", async () => {
    currentUser = null;
    const { POST } = await import("./route");
    const bytes = await fixture("valid-two-page.pdf");
    const response = await POST(requestWithFields(bytes, baseFields([1, 2])));

    expect(response.status).toBe(401);
    expect(stories.size).toBe(0);
  });

  it("creates a draft with the selected pages attached", async () => {
    const { POST } = await import("./route");
    const bytes = await fixture("valid-two-page.pdf");
    const response = await POST(requestWithFields(bytes, baseFields([2, 1])));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.attachedCount).toBe(2);
    expect(body.storyId).toBeTruthy();
  });

  it("defaults to a new-zealand draft when the country field is missing (back-compat)", async () => {
    const { POST } = await import("./route");
    const bytes = await fixture("valid-two-page.pdf");
    const response = await POST(requestWithFields(bytes, baseFields([1])));

    expect(response.status).toBe(200);
    const createCall = fakeSupabase.rpc.mock.calls.find(
      ([name]) => name === "create_self_service_draft",
    );
    expect(createCall?.[1].p_country_slug).toBe("new-zealand");
  });

  it("passes a valid country field through to create_self_service_draft as p_country_slug", async () => {
    const { POST } = await import("./route");
    const bytes = await fixture("valid-two-page.pdf");
    const response = await POST(
      requestWithFields(bytes, { ...baseFields([1]), country: "china" }),
    );

    expect(response.status).toBe(200);
    const createCall = fakeSupabase.rpc.mock.calls.find(
      ([name]) => name === "create_self_service_draft",
    );
    expect(createCall?.[1].p_country_slug).toBe("china");
  });

  it("rejects an invalid country field without creating a draft", async () => {
    const { POST } = await import("./route");
    const bytes = await fixture("valid-two-page.pdf");
    const response = await POST(
      requestWithFields(bytes, {
        ...baseFields([1]),
        country: "not-a-real-country",
      }),
    );

    expect(response.status).toBe(400);
    expect(stories.size).toBe(0);
    expect(fakeSupabase.rpc).not.toHaveBeenCalledWith(
      "create_self_service_draft",
      expect.anything(),
    );
  });
});
