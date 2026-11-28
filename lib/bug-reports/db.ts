import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BugReportStatus } from "@/lib/validation/bug-report";

/**
 * The bug_reports table and submit_bug_report() RPC, in one place.
 *
 * TEMPORARY TYPING SHIM: 20261128090000_bug_reports.sql is written but not
 * yet applied to the hosted project, so types/database.ts (generated, never
 * hand-edited) does not know these names yet. The client is narrowed to the
 * exact shapes below instead. Once the migration is applied and
 * `npm run supabase:types:linked` regenerates the types, these helpers can
 * take the typed client directly and the casts go.
 */

export type BugReportRow = {
  id: string;
  reporter_id: string | null;
  description: string;
  page_path: string | null;
  user_agent: string | null;
  status: BugReportStatus;
  created_at: string;
  updated_at: string;
};

type SubmitArgs = {
  p_description: string;
  p_page_path?: string;
  p_user_agent?: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see header
type Untyped = SupabaseClient<any, "public", "public", any, any>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any typed client
type AnyClient = SupabaseClient<any, any, any, any, any>;

export async function callSubmitBugReport(
  client: AnyClient,
  args: SubmitArgs,
): Promise<{ error: unknown }> {
  const { error } = await (client as Untyped).rpc("submit_bug_report", args);
  return { error };
}

/** Newest first. RLS returns rows to admins only; anyone else gets []. */
export async function listBugReports(
  client: AnyClient,
  options: { status?: BugReportStatus; limit: number },
): Promise<BugReportRow[]> {
  let query = (client as Untyped)
    .from("bug_reports")
    .select(
      "id, reporter_id, description, page_path, user_agent, status, created_at, updated_at",
    )
    .order("created_at", { ascending: false })
    .limit(options.limit);
  if (options.status) query = query.eq("status", options.status);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as BugReportRow[];
}

/**
 * Changes one report's status. RLS ("admin updates status") and the
 * column-level grant (status only) are the boundary; returns false when no
 * row was updated (not an admin, or no such report).
 */
export async function setBugReportStatus(
  client: AnyClient,
  reportId: string,
  status: BugReportStatus,
): Promise<boolean> {
  const { data, error } = await (client as Untyped)
    .from("bug_reports")
    .update({ status })
    .eq("id", reportId)
    .select("id");
  if (error) throw error;
  return Array.isArray(data) && data.length === 1;
}
