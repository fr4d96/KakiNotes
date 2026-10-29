/**
 * RLS proof for the move-to-Drive tool
 * (supabase/migrations/20261008053425_story_media_move_to_drive.sql). Runs
 * against the REAL linked dev project, same fixed-account convention and
 * safety checks as drive-connections-rls.integration.test.ts -- run via
 * `npm run test:rls`, never part of `npm run verify`.
 *
 * What a real move does end to end needs a real Google sign-in, so it is
 * checked by hand (docs/implementation-status.md); this file proves the
 * database boundary: nobody can read or write the job tables directly, the
 * service-role-only RPCs refuse a signed-in contributor, and a run id that
 * isn't the caller's own running run gets nowhere.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

function untypedTable(client: SupabaseClient<Database>, table: string) {
  return client.from(table as never) as unknown as {
    select: (columns: string) => Promise<{
      data: unknown;
      error: { message: string } | null;
    }>;
    insert: (values: Record<string, unknown>) => Promise<{
      error: { message: string } | null;
    }>;
  };
}

function untypedRpc(
  client: SupabaseClient<Database>,
  name: string,
  args: Record<string, unknown> = {},
) {
  return client.rpc(name as never, args as never) as unknown as Promise<{
    data: unknown;
    error: { message: string } | null;
  }>;
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
const FORGED_ID = "00000000-0000-4000-8000-000000000000";

let owner: SupabaseClient<Database>;
let anon: SupabaseClient<Database>;

beforeAll(async () => {
  owner = createClient<Database>(url, key);
  const { error } = await owner.auth.signInWithPassword({
    email: process.env.SUPABASE_RLS_TEST_OWNER_EMAIL!,
    password: process.env.SUPABASE_RLS_TEST_OWNER_PASSWORD!,
  });
  if (error) throw new Error(`Could not sign in as owner: ${error.message}`);
  anon = createClient<Database>(url, key);
});

afterAll(async () => {
  await owner?.auth.signOut();
});

describe.each(["story_media_move_runs", "story_media_move_jobs"])(
  "%s is deny-all",
  (table) => {
    it("anon cannot read it", async () => {
      const { data, error } = await untypedTable(anon, table).select("*");
      expect(error ? [] : data).toEqual([]);
    });

    it("a signed-in contributor cannot read it", async () => {
      const { data, error } = await untypedTable(owner, table).select("*");
      expect(error ? [] : data).toEqual([]);
    });

    it("a signed-in contributor cannot write it", async () => {
      const { error } = await untypedTable(owner, table).insert({
        user_id: FORGED_ID,
      });
      expect(error).not.toBeNull();
    });
  },
);

describe("move RPCs", () => {
  it("anon cannot start a run", async () => {
    const { error } = await untypedRpc(anon, "begin_drive_move_run");
    expect(error).not.toBeNull();
  });

  it("the service-role-only RPCs refuse a signed-in contributor", async () => {
    for (const name of [
      "get_drive_move_cleanup_target",
      "record_drive_move_old_deleted",
    ]) {
      const { error } = await untypedRpc(owner, name, { p_job_id: FORGED_ID });
      expect(error, name).not.toBeNull();
    }
  });

  it("a run id that isn't the caller's own running run gets nowhere", async () => {
    const { error } = await untypedRpc(owner, "claim_next_drive_move", {
      p_run_id: FORGED_ID,
    });
    expect(error?.message).toMatch(/move_run_not_active/);
  });

  it("a job id that isn't the caller's can't be flipped or recorded", async () => {
    const switched = await untypedRpc(owner, "switch_story_media_to_drive", {
      p_job_id: FORGED_ID,
      p_sha256: "x",
    });
    expect(switched.error?.message).toMatch(/No such move job/);

    const copied = await untypedRpc(owner, "record_drive_move_copied", {
      p_job_id: FORGED_ID,
      p_drive_file_id: "f",
      p_drive_folder_id: "d",
    });
    expect(copied.error?.message).toMatch(/No such move job/);
  });

  it("the summary answers for the caller only", async () => {
    const { data, error } = await untypedRpc(
      owner,
      "get_my_drive_move_summary",
    );
    expect(error).toBeNull();
    const rows = data as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]).sort()).toEqual([
      "cleanup_pending_count",
      "movable_count",
      "run_in_progress",
    ]);
  });
});
