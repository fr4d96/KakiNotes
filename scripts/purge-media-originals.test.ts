// @vitest-environment node
//
// The retention sweep's loop, against a fake service-role client. The
// retention RULE is the database's (_story_media_original_is_due); what this
// covers is the script's own job: delete before mark, never mark an
// unconfirmed delete, converge on retry, and never spin forever.
import { describe, expect, it } from "vitest";
import { PRIVATE_BUCKET, purgeDueOriginals } from "./purge-media-originals.mjs";

type DueRow = {
  media_id: string;
  private_storage_path: string;
  processing_state: string;
};

function fakeProject(rows: DueRow[]) {
  // Mirrors the DB: a row is "due" until it has been marked.
  const due = new Map(rows.map((r) => [r.media_id, r]));
  const objects = new Set(rows.map((r) => r.private_storage_path));
  const events: string[] = [];
  const failRemoveFor = new Set<string>();
  const failMarkFor = new Set<string>();

  const admin = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === "list_story_media_originals_due_for_deletion") {
        const limit = args.p_limit as number;
        return { data: [...due.values()].slice(0, limit), error: null };
      }
      if (name === "mark_story_media_original_deleted") {
        const id = args.p_media_id as string;
        if (failMarkFor.has(id)) {
          return { data: null, error: { message: "mark failed" } };
        }
        events.push(`mark:${id}`);
        due.delete(id);
        return { data: null, error: null };
      }
      throw new Error(`unexpected rpc ${name}`);
    },
    storage: {
      from: (bucket: string) => ({
        remove: async (paths: string[]) => {
          expect(bucket).toBe(PRIVATE_BUCKET);
          const path = paths[0];
          if (failRemoveFor.has(path)) {
            return { data: null, error: { message: "remove failed" } };
          }
          events.push(`remove:${path}`);
          // Removing a missing object is a no-op, like Supabase Storage.
          objects.delete(path);
          return { data: [], error: null };
        },
      }),
    },
  };

  return { admin, due, objects, events, failRemoveFor, failMarkFor };
}

const row = (n: number, state = "promoted"): DueRow => ({
  media_id: `m${n}`,
  private_storage_path: `s/m${n}/original.jpg`,
  processing_state: state,
});

const quiet = () => {};

describe("purgeDueOriginals", () => {
  it("dry run reports what is due and deletes nothing", async () => {
    const p = fakeProject([row(1), row(2, "failed")]);
    const lines: string[] = [];

    const totals = await purgeDueOriginals({
      admin: p.admin,
      execute: false,
      log: (l: string) => lines.push(l),
    });

    expect(totals).toEqual({ found: 2, deleted: 0, failed: 0 });
    expect(p.events).toEqual([]);
    expect(p.objects.size).toBe(2);
    expect(lines.join("\n")).toContain("s/m1/original.jpg");
  });

  it("deletes each object before marking it, across several batches", async () => {
    const p = fakeProject([1, 2, 3, 4, 5].map((n) => row(n)));

    const totals = await purgeDueOriginals({
      admin: p.admin,
      execute: true,
      batchSize: 2,
      log: quiet,
    });

    expect(totals).toEqual({ found: 5, deleted: 5, failed: 0 });
    expect(p.objects.size).toBe(0);
    expect(p.due.size).toBe(0);
    for (const n of [1, 2, 3, 4, 5]) {
      expect(p.events.indexOf(`remove:s/m${n}/original.jpg`)).toBeLessThan(
        p.events.indexOf(`mark:m${n}`),
      );
    }
  });

  it("never marks a row whose delete failed, and still finishes the rest", async () => {
    const p = fakeProject([row(1), row(2), row(3)]);
    p.failRemoveFor.add("s/m2/original.jpg");

    const totals = await purgeDueOriginals({
      admin: p.admin,
      execute: true,
      batchSize: 2,
      log: quiet,
    });

    expect(totals).toEqual({ found: 3, deleted: 2, failed: 1 });
    expect(p.events).not.toContain("mark:m2");
    expect(p.due.has("m2")).toBe(true);
    expect(p.objects.has("s/m2/original.jpg")).toBe(true);
  });

  it("stops instead of looping when a whole batch makes no progress", async () => {
    const p = fakeProject([row(1), row(2)]);
    p.failRemoveFor.add("s/m1/original.jpg");
    p.failRemoveFor.add("s/m2/original.jpg");

    const totals = await purgeDueOriginals({
      admin: p.admin,
      execute: true,
      log: quiet,
    });

    expect(totals).toEqual({ found: 2, deleted: 0, failed: 2 });
  });

  it("converges on a re-run after a mark failed post-delete", async () => {
    const p = fakeProject([row(1)]);
    p.failMarkFor.add("m1");

    const first = await purgeDueOriginals({
      admin: p.admin,
      execute: true,
      log: quiet,
    });
    expect(first).toEqual({ found: 1, deleted: 0, failed: 1 });
    expect(p.objects.has("s/m1/original.jpg")).toBe(false);
    expect(p.due.has("m1")).toBe(true);

    p.failMarkFor.clear();
    const second = await purgeDueOriginals({
      admin: p.admin,
      execute: true,
      log: quiet,
    });
    expect(second).toEqual({ found: 1, deleted: 1, failed: 0 });
    expect(p.due.size).toBe(0);
  });

  it("throws when the candidate list itself cannot be read", async () => {
    const admin = {
      rpc: async () => ({
        data: null,
        error: { message: "permission denied" },
      }),
      storage: { from: () => ({ remove: async () => ({ error: null }) }) },
    };

    await expect(
      purgeDueOriginals({ admin, execute: true, log: quiet }),
    ).rejects.toThrow(/permission denied/);
  });
});
