/**
 * RLS proof for get_drive_media_for_proxy() (RPC (c) -- the Drive proxy
 * route's lookup, docs/google-drive-integration.md section 5, migration
 * supabase/migrations/20261007063355_story_media_drive_backend.sql). Same
 * fixed-account-pool convention as tests/integration/story-rls.integration.
 * test.ts and drive-connections-rls.integration.test.ts -- not part of
 * `npm run verify` / default `vitest run`; run explicitly via
 * `npm run test:rls`.
 *
 * Fixtures are created by beforeAll, the same way story-rls.integration.
 * test.ts creates its own story/revision fixtures -- no placeholder UUIDs,
 * no service-role path.
 *
 * ONE real gap, not fixturable through any public RPC: a `google_drive`-
 * backend story_media row only ever comes into existence via
 * begin_drive_media_upload() + an actual Drive resumable upload +
 * finalize_drive_media_upload() -- and begin_drive_media_upload() itself
 * raises unless the caller's account already has an ACTIVE row in
 * contributor_drive_connections, which only a real completed Google OAuth
 * flow (app/(contributor)/account/drive/connect|callback) can create.
 * There is no RPC that lets this suite fabricate that connection row, and
 * inventing a service-role insert to fake one was explicitly ruled out for
 * this task. The two tests that need a real google_drive row are therefore
 * `it.skip`, not deleted and not pointed at a placeholder id -- see each
 * one's own comment. Everything else in this file creates and asserts
 * against REAL rows.
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
const slug = (label: string) => `drive-media-rls-${runId}-${label}`;

function anonClient(): SupabaseClient<Database> {
  return createClient<Database>(url, key);
}

let owner: { client: SupabaseClient<Database>; userId: string };
let editor: { client: SupabaseClient<Database>; userId: string };
let anon: SupabaseClient<Database>;
let ownerRevisionId: string;
// A real, draft (pending_upload) SUPABASE-backend media reservation --
// created via begin_story_media_upload(), no real storage bytes needed:
// get_drive_media_for_proxy() filters on storage_backend before it ever
// looks at processing_state, so a bare reservation already proves the
// "never a supabase row" assertion for real.
//
// Made by the EDITOR on an editorial import of the owner's contributor
// identity, not by the owner: since 20261113075945 a contributor with no
// active Drive connection can't create a supabase-backed photo of their
// own any more (trigger story_media_require_drive_for_contributors), and
// the owner test account has no Drive connection (see the module doc
// comment). Editorial-import photos still use Supabase by design.
let supabaseMediaId: string;

async function signIn(email: string, password: string) {
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

beforeAll(async () => {
  owner = await signIn(
    process.env.SUPABASE_RLS_TEST_OWNER_EMAIL!,
    process.env.SUPABASE_RLS_TEST_OWNER_PASSWORD!,
  );
  editor = await signIn(
    process.env.SUPABASE_RLS_TEST_EDITOR_EMAIL!,
    process.env.SUPABASE_RLS_TEST_EDITOR_PASSWORD!,
  );
  anon = anonClient();

  const { data: created, error: draftError } = await owner.client.rpc(
    "create_self_service_draft",
    { p_title: slug("own-draft") },
  );
  if (draftError || !created?.[0]) {
    throw new Error(`Could not create draft: ${draftError?.message}`);
  }
  ownerRevisionId = created[0].revision_id;

  const { data: contributor, error: contributorError } = await owner.client
    .from("contributors")
    .select("id")
    .eq("linked_user_id", owner.userId)
    .single();
  if (contributorError || !contributor) {
    throw new Error(
      `Owner has no contributor identity: ${contributorError?.message}`,
    );
  }

  const { data: imported, error: importError } = await editor.client.rpc(
    "create_editorial_import_draft",
    { p_contributor_id: contributor.id, p_title: slug("supabase-media") },
  );
  if (importError || !imported?.[0]) {
    throw new Error(
      `Could not create editorial import draft: ${importError?.message}`,
    );
  }

  const { data: media, error: mediaError } = await editor.client.rpc(
    "begin_story_media_upload",
    {
      p_revision_id: imported[0].revision_id,
      p_source_mime_type: "image/jpeg",
    },
  );
  if (mediaError || !media?.[0]) {
    throw new Error(
      `Could not reserve a supabase media slot: ${mediaError?.message}`,
    );
  }
  supabaseMediaId = media[0].media_id;
}, 30000);

afterAll(async () => {
  await owner?.client.auth.signOut();
  await editor?.client.auth.signOut();
});

describe("mandatory Google Drive for a contributor's own photos", () => {
  it("refuses a supabase upload slot for the owner of a self-submitted story with no active Drive connection", async () => {
    const { data, error } = await owner.client.rpc("begin_story_media_upload", {
      p_revision_id: ownerRevisionId,
      p_source_mime_type: "image/jpeg",
    });
    expect(data).toBeNull();
    expect(error?.message).toContain("drive_required");
  });
});

describe("get_drive_media_for_proxy() RLS", () => {
  // SKIPPED: needs a real google_drive-backend row, which needs a real
  // completed Google OAuth connection for the owner test account -- not
  // fixturable through any public RPC (see the module doc comment above).
  it.skip("anon gets a published google_drive row", async () => {
    // Intentionally left unimplemented -- see module doc comment.
  });

  // SKIPPED: same reason as above.
  it.skip("the owning contributor gets their own draft google_drive row via the preview branch", async () => {
    // Intentionally left unimplemented -- see module doc comment.
  });

  it("anon never gets a supabase-backend row, published or not", async () => {
    const { data, error } = await anon.rpc(
      "get_drive_media_for_proxy" as never,
      { p_media_id: supabaseMediaId } as never,
    );
    expect(error).toBeNull();
    expect((data ?? []) as unknown[]).toEqual([]);
  });

  it("the story's contributor doesn't get its supabase-backend row from this RPC either -- it's not what this RPC is for", async () => {
    const { data, error } = await owner.client.rpc(
      "get_drive_media_for_proxy" as never,
      { p_media_id: supabaseMediaId } as never,
    );
    expect(error).toBeNull();
    expect((data ?? []) as unknown[]).toEqual([]);
  });
});
