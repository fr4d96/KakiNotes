import { describe, expect, it } from "vitest";
import type { ModeratorMediaItem } from "@/lib/story/moderation";
import { bulkApproveBlocker, hasReadableContent } from "./bulk-approve";
import { chunk } from "./bulk-approve-chunk";

const TEXT = [{ type: "paragraph", text: "I picked kiwifruit in Te Puke." }];

function detail(overrides: Partial<Parameters<typeof bulkApproveBlocker>[0]>) {
  return {
    revision_status: "submitted",
    consent_valid: true,
    content_json: TEXT,
    ...overrides,
  };
}

function photo(
  processingState: string,
  storageBackend?: string,
): ModeratorMediaItem {
  return {
    mediaId: "m",
    sortOrder: 0,
    isCover: true,
    altText: null,
    caption: null,
    decorative: true,
    processingState,
    storageBackend,
  };
}

describe("bulkApproveBlocker", () => {
  it("allows a ready submission, with or without photos", () => {
    expect(bulkApproveBlocker(detail({}), [])).toBeNull();
    expect(
      bulkApproveBlocker(detail({}), [
        photo("processed"),
        photo("processed", "google_drive"),
        photo("promoted"),
      ]),
    ).toBeNull();
  });

  it.each(["draft", "approved", "rejected", "changes_requested", "withdrawn"])(
    "refuses a revision that is %s",
    (revision_status) => {
      expect(bulkApproveBlocker(detail({ revision_status }), [])).toMatch(
        /no longer waiting/i,
      );
    },
  );

  it("refuses a revision with no valid consent", () => {
    expect(bulkApproveBlocker(detail({ consent_valid: false }), [])).toMatch(
      /consent/i,
    );
  });

  it.each([[[]], [null], [[{ type: "paragraph", text: "   " }]], ["nonsense"]])(
    "refuses content with nothing to read: %j",
    (content_json) => {
      expect(hasReadableContent(content_json)).toBe(false);
      expect(bulkApproveBlocker(detail({ content_json }), [])).toMatch(
        /readable/i,
      );
    },
  );

  it.each([
    "pending_upload",
    "uploaded",
    "processing",
    "failed",
    "quarantined",
  ])("refuses when a photo is %s", (state) => {
    expect(
      bulkApproveBlocker(detail({}), [photo("processed"), photo(state)]),
    ).toMatch(/photo/i);
  });
});

describe("chunk", () => {
  it("splits in order with a short last piece", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 4)).toEqual([]);
  });
});
