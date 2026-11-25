#!/usr/bin/env node
// Fail-closed maintenance script for abandoned/orphaned media (Prompt 4).
// Three candidate sets, all read via the service-role client (never a
// raw `delete from storage.objects` — actual object deletion always goes
// through the Supabase Storage API), then reconciled via narrow,
// service_role-only RPCs (maintenance_cancel_abandoned_reservation /
// maintenance_resolve_orphaned_copy_attempt / maintenance_claim_abandoned_
// public_copy / maintenance_record_public_copy_removed) so every database
// mutation respects the same DB-level invariants as every other path.
//
// - story_media rows still `pending_upload` after 24h (far beyond any
//   realistic single upload duration).
// - story_media_public_copy_attempts rows still unresolved and untouched for
//   1h. updated_at, not created_at: begin_story_publication_attempt()
//   refreshes it when a failed approval is retried, so an approval in
//   progress is never mistaken for an orphan
//   (20261125100000_resume_active_publication_attempt.sql). These are only
//   marked abandoned here, which makes them the next set's candidates.
// - copies abandoned over 1h ago (rejected, sent back, withdrawn, or resolved
//   by the set above on an earlier run) whose object may still be in the
//   public bucket and that nothing published or in progress uses. Claimed
//   before deleting, so a new approval of the same photo cannot rely on an
//   object that is about to go
//   (20261125120000_remove_abandoned_public_copies.sql).
//
// Dry-run by default. Pass --execute to actually delete anything. Requires
// dedicated SUPABASE_MAINTENANCE_* env vars, loaded only via an explicit
// --env-file=.env.maintenance.local — never falls back to the app's
// runtime .env.local, mirroring the existing SUPABASE_RLS_TEST_* isolation
// pattern in scripts/run-rls-cleanup.mjs.

import { createClient } from "@supabase/supabase-js";

const BATCH_SIZE = 100;
const PENDING_UPLOAD_AGE_HOURS = 24;
const UNRESOLVED_COPY_ATTEMPT_AGE_HOURS = 1;

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

  console.log(`[media-cleanup] target host: ${new URL(url).host} (ref ${ref})`);
}

async function main() {
  assertSafeToRun();

  const execute = process.argv.includes("--execute");
  console.log(
    `[media-cleanup] mode: ${execute ? "EXECUTE (destructive)" : "DRY RUN (report only)"}`,
  );

  const admin = createClient(
    process.env.SUPABASE_MAINTENANCE_URL,
    process.env.SUPABASE_MAINTENANCE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const pendingCutoff = new Date(
    Date.now() - PENDING_UPLOAD_AGE_HOURS * 60 * 60 * 1000,
  ).toISOString();
  const { data: pendingUploads, error: pendingError } = await admin
    .from("story_media")
    .select("id, private_storage_path, created_at")
    .eq("processing_state", "pending_upload")
    .lt("created_at", pendingCutoff)
    .limit(BATCH_SIZE);
  if (pendingError) {
    console.error(
      "Failed to query abandoned pending uploads:",
      pendingError.message,
    );
    process.exit(1);
  }

  console.log(
    `[media-cleanup] ${pendingUploads.length} abandoned pending upload(s) found.`,
  );
  for (const row of pendingUploads) {
    console.log(
      `  - story_media ${row.id} (reserved ${row.created_at}) at ${row.private_storage_path}`,
    );
    if (!execute) continue;

    const { error: removeError } = await admin.storage
      .from("story-images-private")
      .remove([row.private_storage_path]);
    if (removeError) {
      console.warn(
        `    [warn] could not delete storage object (may not exist): ${removeError.message}`,
      );
    }
    const { error: rpcError } = await admin.rpc(
      "maintenance_cancel_abandoned_reservation",
      { p_media_id: row.id },
    );
    if (rpcError) {
      console.error(
        `    [error] maintenance_cancel_abandoned_reservation failed: ${rpcError.message}`,
      );
    } else {
      console.log("    cleaned up.");
    }
  }

  const copyCutoff = new Date(
    Date.now() - UNRESOLVED_COPY_ATTEMPT_AGE_HOURS * 60 * 60 * 1000,
  ).toISOString();
  const { data: orphanedCopies, error: copyError } = await admin
    .from("story_media_public_copy_attempts")
    .select("id, media_id, public_path, status, created_at, updated_at")
    .is("resolved_at", null)
    .lt("updated_at", copyCutoff)
    .limit(BATCH_SIZE);
  if (copyError) {
    console.error("Failed to query orphaned copy attempts:", copyError.message);
    process.exit(1);
  }

  console.log(
    `[media-cleanup] ${orphanedCopies.length} unresolved copy attempt(s) found.`,
  );
  for (const row of orphanedCopies) {
    console.log(
      `  - copy attempt ${row.id} (media ${row.media_id}, status ${row.status}) at ${row.public_path}`,
    );
    if (!execute) continue;

    const { error: rpcError } = await admin.rpc(
      "maintenance_resolve_orphaned_copy_attempt",
      {
        p_copy_attempt_id: row.id,
      },
    );
    if (rpcError) {
      console.error(
        `    [error] maintenance_resolve_orphaned_copy_attempt failed: ${rpcError.message}`,
      );
    } else {
      console.log("    resolved.");
    }
  }

  const { data: abandonedCopies, error: abandonedError } = await admin.rpc(
    "maintenance_list_abandoned_public_copies",
    { p_limit: BATCH_SIZE },
  );
  if (abandonedError) {
    console.error(
      "Failed to query abandoned public copies:",
      abandonedError.message,
    );
    process.exit(1);
  }

  console.log(
    `[media-cleanup] ${abandonedCopies.length} abandoned public cop(y/ies) found.`,
  );
  for (const row of abandonedCopies) {
    console.log(
      `  - copy attempt ${row.copy_attempt_id} (media ${row.media_id}) at ${row.public_path}`,
    );
    if (!execute) continue;

    // Re-checked under the photo's row lock. Only the path the claim returns
    // is ever deleted -- never the listed one, which may be out of date.
    const { data: claimedPath, error: claimError } = await admin.rpc(
      "maintenance_claim_abandoned_public_copy",
      { p_copy_attempt_id: row.copy_attempt_id },
    );
    if (claimError) {
      console.error(
        `    [error] maintenance_claim_abandoned_public_copy failed: ${claimError.message}`,
      );
      continue;
    }
    if (!claimedPath) {
      console.log("    skipped: now in use.");
      continue;
    }

    // A path that is already gone is not an error from the Storage API.
    const { error: removeError } = await admin.storage
      .from("story-images-public")
      .remove([claimedPath]);
    if (removeError) {
      // Not recorded as removed: the claim expires and the next run retries.
      console.error(
        `    [error] could not delete public object: ${removeError.message}`,
      );
      continue;
    }

    const { error: recordError } = await admin.rpc(
      "maintenance_record_public_copy_removed",
      { p_copy_attempt_id: row.copy_attempt_id },
    );
    if (recordError) {
      console.error(
        `    [error] maintenance_record_public_copy_removed failed: ${recordError.message}`,
      );
    } else {
      console.log("    removed.");
    }
  }

  if (!execute) {
    console.log(
      "[media-cleanup] Dry run complete. Re-run with --execute to actually delete/resolve.",
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
