/**
 * RLS proof for list_my_photos() (supabase/migrations/
 * 20261010220948_list_my_photos.sql), the My Photos page's one read. Runs
 * against the real linked dev project with the same fixed accounts and
 * safety checks as the other RLS suites -- `npm run test:rls`, never part of
 * `npm run verify`.
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
    "SUPABASE_RLS_TEST_OTHER_EMAIL",
    "SUPABASE_RLS_TEST_OTHER_PASSWORD",
    "SUPABASE_RLS_TEST_MODERATOR_EMAIL",
    "SUPABASE_RLS_TEST_MODERATOR_PASSWORD",
    "SUPABASE_RLS_TEST_ADMIN_EMAIL",
    "SUPABASE_RLS_TEST_ADMIN_PASSWORD",
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

async function signedIn(prefix: string): Promise<SupabaseClient<Database>> {
  const client = createClient<Database>(url, key);
  const { error } = await client.auth.signInWithPassword({
    email: process.env[`SUPABASE_RLS_TEST_${prefix}_EMAIL`]!,
    password: process.env[`SUPABASE_RLS_TEST_${prefix}_PASSWORD`]!,
  });
  if (error)
    throw new Error(`Could not sign in as ${prefix}: ${error.message}`);
  return client;
}

const clients: Record<string, SupabaseClient<Database>> = {};

async function photosOf(client: SupabaseClient<Database>) {
  const { data, error } = await client.rpc("list_my_photos");
  if (error) throw new Error(error.message);
  return data ?? [];
}

beforeAll(async () => {
  for (const who of ["OWNER", "OTHER", "MODERATOR", "ADMIN"]) {
    clients[who] = await signedIn(who);
  }
});

afterAll(async () => {
  await Promise.all(Object.values(clients).map((c) => c.auth.signOut()));
});

describe("list_my_photos()", () => {
  it("refuses a signed-out visitor", async () => {
    const anon = createClient<Database>(url, key);
    const { error } = await anon.rpc("list_my_photos");
    expect(error).not.toBeNull();
  });

  // The RLS accounts usually have no processed photos (getting one there
  // needs the service-role pipeline, which this suite never uses). An empty
  // list would make the two isolation checks below pass without proving
  // anything, so they skip and say why instead. Isolation was also checked
  // against real data by SQL impersonation (docs/implementation-status.md).
  it("lists only photos on stories My Stories shows the caller", async (ctx) => {
    if ((await photosOf(clients.OWNER)).length === 0) {
      ctx.skip("OWNER has no processed photos on the dev project");
    }
    for (const who of ["OWNER", "OTHER"]) {
      const photos = await photosOf(clients[who]);
      const { data: stories, error } =
        await clients[who].rpc("list_my_stories");
      expect(error).toBeNull();
      const mine = new Set((stories ?? []).map((s) => s.id));
      for (const photo of photos) {
        expect(mine.has(photo.story_id), `${who}: ${photo.story_id}`).toBe(
          true,
        );
      }
    }
  });

  it("never shows one person's photos to anyone else -- staff included", async (ctx) => {
    const ownerIds = new Set(
      (await photosOf(clients.OWNER)).map((p) => p.media_id),
    );
    if (ownerIds.size === 0) {
      ctx.skip("OWNER has no processed photos on the dev project");
    }
    for (const who of ["OTHER", "MODERATOR", "ADMIN"]) {
      const theirs = await photosOf(clients[who]);
      expect(
        theirs.filter((p) => ownerIds.has(p.media_id)),
        who,
      ).toEqual([]);
    }
  });

  it("returns no storage path or Drive id, only the declared columns", async () => {
    const photos = await photosOf(clients.OWNER);
    const allowed = [
      "alt_text",
      "caption",
      "in_current_version",
      "lifecycle_status",
      "media_id",
      "processed_file_size_bytes",
      "processed_height",
      "processed_mime_type",
      "processed_width",
      "storage_backend",
      "story_id",
      "story_title",
      "story_updated_at",
      "uploaded_at",
    ];
    for (const photo of photos) {
      expect(Object.keys(photo).sort()).toEqual(allowed);
      expect(JSON.stringify(photo)).not.toMatch(/storage_path|drive_.*file/);
    }
  });
});
