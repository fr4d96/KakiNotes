#!/usr/bin/env node
// Retention sweep for raw story-image originals (Supabase backend).
//
// Deletes the raw upload at story_media.private_storage_path -- full EXIF,
// GPS included -- from story-images-private once it is past retention, then
// records that via mark_story_media_original_deleted. The rule itself lives
// in one place, the database (_story_media_original_is_due in
// supabase/migrations/20261003120000_story_media_original_retention.sql):
//
//   - processed / promotion_pending / promoted: due immediately
//   - failed: due 30 days after upload (kept for repair, see
//     scripts/reprocess-failed-story-media.mjs)
//   - everything else: never touched here
//
// processStoryMedia already deletes the raw inline right after a successful
// process. This script exists for:
//   1. the backlog -- every raw original uploaded before that change, and
//   2. anything the inline delete missed (it is best-effort), plus failed
//      rows crossing the 30-day line.
// Safe to run any number of times, and safe to schedule: removing an object
// that is already gone is a no-op, and a row is only marked after its delete
// succeeded, so a crash mid-run just leaves rows for the next run.
//
// Dry-run by default. Pass --execute to actually delete. Uses the same
// dedicated SUPABASE_MAINTENANCE_* env vars and fail-closed checks as
// scripts/cleanup-abandoned-media-uploads.mjs, loaded only via
// --env-file=.env.maintenance.local -- never the app's runtime .env.local.

import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

export const PRIVATE_BUCKET = "story-images-private";
const DEFAULT_BATCH_SIZE = 100;

/**
 * The sweep itself, separated from env handling so it can be tested against
 * a fake client. Returns counts; never throws for a single bad row.
 *
 * Execute mode keeps pulling batches until none are left. It stops early if
 * a whole batch made no progress (every row errored), so a persistent
 * failure -- a bad key, a Storage outage -- can never spin forever.
 */
export async function purgeDueOriginals({
  admin,
  execute,
  batchSize = DEFAULT_BATCH_SIZE,
  log = console.log,
}) {
  // Sets, not counters: a row that keeps failing comes back in the next
  // batch, and must still count once.
  const seen = new Set();
  const failed = new Set();
  let deleted = 0;

  for (;;) {
    const { data: due, error } = await admin.rpc(
      "list_story_media_originals_due_for_deletion",
      { p_limit: batchSize },
    );
    if (error) {
      throw new Error(
        `list_story_media_originals_due_for_deletion failed: ${error.message}`,
      );
    }
    if (!due || due.length === 0) break;
    for (const row of due) seen.add(row.media_id);

    if (!execute) {
      for (const row of due) {
        log(
          `  - would delete ${row.private_storage_path} (media ${row.media_id}, ${row.processing_state})`,
        );
      }
      if (due.length === batchSize) {
        log(`  ... first ${batchSize} shown; more are due.`);
      }
      break;
    }

    let progress = 0;
    for (const row of due) {
      const { error: removeError } = await admin.storage
        .from(PRIVATE_BUCKET)
        .remove([row.private_storage_path]);
      if (removeError) {
        // Not marked: the object may still exist, so the row must stay due.
        log(
          `  [error] ${row.media_id}: delete failed, left for next run: ${removeError.message}`,
        );
        failed.add(row.media_id);
        continue;
      }
      const { error: markError } = await admin.rpc(
        "mark_story_media_original_deleted",
        { p_media_id: row.media_id },
      );
      if (markError) {
        log(
          `  [error] ${row.media_id}: object deleted but not recorded, next run will retry: ${markError.message}`,
        );
        failed.add(row.media_id);
        continue;
      }
      log(`  deleted ${row.private_storage_path} (${row.processing_state})`);
      failed.delete(row.media_id);
      deleted++;
      progress++;
    }
    if (progress === 0) {
      log("  [error] no progress in this batch; stopping.");
      break;
    }
  }

  return { found: seen.size, deleted, failed: failed.size };
}

function assertSafeToRun() {
  const required = [
    "SUPABASE_MAINTENANCE_URL",
    "SUPABASE_MAINTENANCE_PROJECT_REF",
    "SUPABASE_MAINTENANCE_SERVICE_ROLE_KEY",
    "SUPABASE_MAINTENANCE_CONFIRM",
  ];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`Refusing to run: missing env vars: ${missing.join(", ")}`);
    process.exit(1);
  }

  const url = process.env.SUPABASE_MAINTENANCE_URL;
  const ref = process.env.SUPABASE_MAINTENANCE_PROJECT_REF;
  if (!new URL(url).host.includes(ref)) {
    console.error(
      `Refusing to run: SUPABASE_MAINTENANCE_URL (${url}) does not contain SUPABASE_MAINTENANCE_PROJECT_REF (${ref}).`,
    );
    process.exit(1);
  }

  const expectedConfirm = `i-confirm-cleanup-${ref}`;
  if (process.env.SUPABASE_MAINTENANCE_CONFIRM !== expectedConfirm) {
    console.error(
      `Refusing to run: SUPABASE_MAINTENANCE_CONFIRM must exactly equal "${expectedConfirm}".`,
    );
    process.exit(1);
  }

  console.log(
    `[purge-originals] target host: ${new URL(url).host} (ref ${ref})`,
  );
}

async function main() {
  assertSafeToRun();

  const execute = process.argv.includes("--execute");
  console.log(
    `[purge-originals] mode: ${execute ? "EXECUTE (destructive)" : "DRY RUN (report only)"}`,
  );

  const admin = createClient(
    process.env.SUPABASE_MAINTENANCE_URL,
    process.env.SUPABASE_MAINTENANCE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const totals = await purgeDueOriginals({ admin, execute });
  console.log(
    `[purge-originals] ${totals.found} due, ${totals.deleted} deleted, ${totals.failed} failed.`,
  );
  if (!execute) {
    console.log(
      "[purge-originals] Dry run complete. Re-run with --execute to actually delete.",
    );
  }
  if (totals.failed > 0) process.exit(1);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
