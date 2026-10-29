/**
 * RLS proof for contributor_drive_connections (drive_connections slice 1
 * -- docs/google-drive-integration.md section 3/11). Runs against the REAL
 * linked hosted Supabase dev project, same fixed-account-pool convention
 * as tests/integration/story-rls.integration.test.ts -- not part of
 * `npm run verify` / default `vitest run`; run explicitly via
 * `npm run test:rls`.
 *
 * NOTE for whoever picks this up next: this file could not be executed in
 * the environment this slice was built in (no live Supabase project
 * reachable here, and the migration was deliberately never applied to
 * any database per this task's instructions). It is written and should
 * typecheck/lint cleanly, but it has not actually been run against a real
 * project yet -- do that once the migration lands somewhere real.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Same escape hatch as story-rls.integration.test.ts's untypedTable(): the
 * table isn't in types/database.ts yet (regenerating requires applying the
 * migration to a live project, which this task's instructions forbid), so
 * this calls it by name rather than through the typed `.from()` overload.
 * Only ever used to assert that a direct select/insert is REJECTED.
 */
function untypedTable(client: SupabaseClient<Database>, table: string) {
  return client.from(table as never) as unknown as {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => Promise<{
        data: unknown;
        error: { message: string; code?: string } | null;
      }>;
    };
    insert: (values: Record<string, unknown>) => Promise<{
      error: { message: string; code?: string } | null;
    }>;
  };
}

function assertSafeToRun() {
  const required = [
    "SUPABASE_RLS_TEST_URL",
    "SUPABASE_RLS_TEST_PROJECT_REF",
    "SUPABASE_RLS_TEST_PUBLISHABLE_KEY",
    "SUPABASE_RLS_TEST_CONFIRM",
    "SUPABASE_RLS_TEST_OWNER_EMAIL",
    "SUPABASE_RLS_TEST_OWNER_PASSWORD",
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

function anonClient(): SupabaseClient<Database> {
  return createClient<Database>(url, key);
}

let owner: { client: SupabaseClient<Database>; userId: string };
let anon: SupabaseClient<Database>;

beforeAll(async () => {
  const client = anonClient();
  const { data, error } = await client.auth.signInWithPassword({
    email: process.env.SUPABASE_RLS_TEST_OWNER_EMAIL!,
    password: process.env.SUPABASE_RLS_TEST_OWNER_PASSWORD!,
  });
  if (error || !data.user) {
    throw new Error(`Could not sign in as owner: ${error?.message}`);
  }
  owner = { client, userId: data.user.id };
  anon = anonClient();
});

afterAll(async () => {
  await owner?.client.auth.signOut();
});

describe("contributor_drive_connections RLS (deny-all for anon/authenticated)", () => {
  it("anon cannot select any row, even scoped to a real user_id", async () => {
    const { data, error } = await untypedTable(
      anon,
      "contributor_drive_connections",
    )
      .select("*")
      .eq("user_id", owner.userId);
    // RLS enabled with zero policies: either an empty result or a
    // permission error is an acceptable "denied" shape -- what must NEVER
    // happen is a row coming back.
    expect(error ? [] : data).toEqual([]);
  });

  it("a signed-in contributor cannot select their OWN row directly", async () => {
    const { data, error } = await untypedTable(
      owner.client,
      "contributor_drive_connections",
    )
      .select("*")
      .eq("user_id", owner.userId);
    expect(error ? [] : data).toEqual([]);
  });

  it("a signed-in contributor cannot insert a row directly (table grants revoked)", async () => {
    const { error } = await untypedTable(
      owner.client,
      "contributor_drive_connections",
    ).insert({
      user_id: owner.userId,
      encrypted_refresh_token: Buffer.from("x").toString("base64"),
      token_iv: Buffer.from("x").toString("base64"),
      token_auth_tag: Buffer.from("x").toString("base64"),
    });
    expect(error).not.toBeNull();
  });

  it("get_my_drive_connection_status() never returns a token column", async () => {
    const { data, error } = await owner.client.rpc(
      "get_my_drive_connection_status" as never,
    );
    expect(error).toBeNull();
    const rows = (data ?? []) as Record<string, unknown>[];
    for (const row of rows) {
      expect(Object.keys(row)).not.toContain("encrypted_refresh_token");
      expect(Object.keys(row)).not.toContain("token_iv");
      expect(Object.keys(row)).not.toContain("token_auth_tag");
    }
  });
});
