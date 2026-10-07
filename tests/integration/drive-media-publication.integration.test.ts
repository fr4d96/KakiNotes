/**
 * Round A review (2026-10-07), MUST-FIX 1 and MUST-FIX 2. Same fixed-
 * account-pool convention as tests/integration/drive-media-rls.integration.
 * test.ts and story-rls.integration.test.ts -- not part of `npm run verify`
 * / default `vitest run`; run explicitly via `npm run test:rls`.
 *
 * Fixtures are created for real by beforeAll/each test, the same way
 * story-rls.integration.test.ts creates its own story/revision fixtures --
 * no placeholder UUIDs.
 *
 * MUST-FIX 2 (Drive mode is owner-only) is fully real: an editorial-import
 * draft, created and therefore assigned to the EDITOR test account (editor
 * accounts get assigned_editor_id = auth.uid() on create_editorial_import_
 * draft()), gives a real revision that account has genuine
 * _authorize_revision_edit rights on, but is NOT a self_submitted story's
 * own owner -- exactly MUST-FIX 2's rejection case.
 *
 * MUST-FIX 1 (mixed-backend publication) is SKIPPED, for a real reason:
 * it needs an actual google_drive-backend story_media row, which only
 * comes into existence via begin_drive_media_upload() + a real Drive
 * resumable upload + finalize_drive_media_upload() -- and begin_drive_
 * media_upload() itself requires the caller's account to already hold an
 * ACTIVE row in contributor_drive_connections, which only a completed
 * Google OAuth flow can create. No RPC lets this suite fabricate that
 * connection, and a service-role insert to fake one was explicitly ruled
 * out for this task. See the test's own comment.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

function assertSafeToRun() {
  const required = [
    "SUPABASE_RLS_TEST_URL",
    "SUPABASE_RLS_TEST_PROJECT_REF",
    "SUPABASE_RLS_TEST_PUBLISHABLE_KEY",
    "SUPABASE_RLS_TEST_CONFIRM",
    "SUPABASE_RLS_TEST_OWNER_EMAIL",
    "SUPABASE_RLS_TEST_OWNER_PASSWORD",
    "SUPABASE_RLS_TEST_EDITOR_EMAIL",
    "SUPABASE_RLS_TEST_EDITOR_PASSWORD",
  ];
  for (const name of required) {
    if (!process.env[name]) {
      throw new Error(`RLS integration suite refuses to run: missing ${name}.`);
    }
  }

  const url = process.env.SUPABASE_RLS_TEST_URL!;
  const ref = process.env.SUPABASE_RLS_TEST_PROJECT_REF!;
  if (!new URL(url).host.includes(ref)) {
    throw new Error(
      `RLS integration suite refuses to run: SUPABASE_RLS_TEST_URL (${url}) does not contain SUPABASE_RLS_TEST_PROJECT_REF (${ref}).`,
    );
  }

  const expectedConfirm = `i-confirm-${ref}-is-a-disposable-dev-project`;
  if (process.env.SUPABASE_RLS_TEST_CONFIRM !== expectedConfirm) {
    throw new Error(
      `RLS integration suite refuses to run: SUPABASE_RLS_TEST_CONFIRM must exactly equal "${expectedConfirm}".`,
    );
  }
}

assertSafeToRun();

const url = process.env.SUPABASE_RLS_TEST_URL!;
const key = process.env.SUPABASE_RLS_TEST_PUBLISHABLE_KEY!;

const runId = Math.random().toString(36).slice(2, 10);
const slug = (label: string) => `drive-media-pub-${runId}-${label}`;

function anonClient(): SupabaseClient<Database> {
  return createClient<Database>(url, key);
}

async function signedInClient(email: string, password: string) {
  const client = anonClient();
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.user) {
    throw new Error(`Could not sign in as ${email}: ${error?.message}`);
  }
  return { client, userId: data.user.id };
}

let editor: { client: SupabaseClient<Database>; userId: string };
// A real editorial-import revision the editor account has genuine edit
// rights on via assigned_editor_id -- never as a self_submitted owner.
let editorialRevisionId: string;

beforeAll(async () => {
  editor = await signedInClient(
    process.env.SUPABASE_RLS_TEST_EDITOR_EMAIL!,
    process.env.SUPABASE_RLS_TEST_EDITOR_PASSWORD!,
  );

  const { data: contributor, error: contributorError } = await editor.client
    .from("contributors")
    .insert({
      created_by: editor.userId,
      display_name: "Drive Media Pub Test Contributor",
      attribution_type: "display_name",
    })
    .select("id")
    .single();
  if (contributorError || !contributor) {
    throw new Error(
      `Could not create test contributor: ${contributorError?.message}`,
    );
  }

  // create_editorial_import_draft() defaults p_assigned_editor_id to
  // auth.uid() (the caller) when not explicitly overridden -- so this
  // editor account is now the real assigned_editor_id on the resulting
  // story/revision, with no self_submitted ownership of any kind.
  const { data: created, error: createError } = await editor.client.rpc(
    "create_editorial_import_draft",
    {
      p_contributor_id: contributor.id,
      p_title: slug("editorial"),
    },
  );
  if (createError || !created?.[0]) {
    throw new Error(
      `Could not create editorial-import draft: ${createError?.message}`,
    );
  }
  editorialRevisionId = created[0].revision_id;
}, 30000);

afterAll(async () => {
  await editor?.client.auth.signOut();
});

describe("MUST-FIX 2: Drive mode is restricted to the self-submitted story's own owner", () => {
  it("begin_drive_media_upload rejects an assigned editor on an editorial-import revision", async () => {
    const { error } = await editor.client.rpc(
      "begin_drive_media_upload" as never,
      {
        p_revision_id: editorialRevisionId,
        p_source_mime_type: "image/jpeg",
      } as never,
    );
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/self-submitted story's own contributor/);
  });
});

describe("MUST-FIX 1: a revision with mixed supabase + google_drive media publishes successfully", () => {
  // SKIPPED, for a real reason, not a placeholder-id failure: this needs
  // an actual google_drive-backend story_media row at processing_state =
  // 'processed', which only comes into existence via begin_drive_media_
  // upload() + a real Drive resumable upload + finalize_drive_media_
  // upload() -- and begin_drive_media_upload() itself requires the
  // caller's account to already hold an ACTIVE contributor_drive_
  // connections row, which only a completed Google OAuth flow can create.
  // No RPC lets this suite fabricate that connection (or the row it would
  // produce), and a service-role insert to fake either was explicitly
  // ruled out for this task -- flagged for the coordinator to decide
  // rather than invented here.
  it.skip("finalize_story_publication promotes both backends without raising", async () => {
    // Intentionally left unimplemented -- see this describe block's
    // comment and the module doc comment above.
  });
});
