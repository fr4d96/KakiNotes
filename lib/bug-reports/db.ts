import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  BUG_REPORT_STATUSES,
  type BugReportStatus,
} from "@/lib/validation/bug-report";

/**
 * The bug_reports table and submit_bug_report() RPC
 * (supabase/migrations/20261128022130_bug_reports.sql), in one place.
 */

type Client = SupabaseClient<Database>;

export type BugReportRow = Omit<
  Database["public"]["Tables"]["bug_reports"]["Row"],
  "status"
> & { status: BugReportStatus };

export type SubmitBugReportArgs =
  Database["public"]["Functions"]["submit_bug_report"]["Args"];

export async function callSubmitBugReport(
  client: Client,
  args: SubmitBugReportArgs,
): Promise<{ error: unknown }> {
  const { error } = await client.rpc("submit_bug_report", args);
  return { error };
}

/**
 * The generated type says `string` (a CHECK constraint is invisible to the
 * generator); the constraint guarantees one of the four, and anything else
 * is shown as "open" rather than crashing the list.
 */
function asStatus(value: string): BugReportStatus {
  return BUG_REPORT_STATUSES.find((s) => s === value) ?? "open";
}

/** Newest first. RLS returns rows to admins only; anyone else gets []. */
export async function listBugReports(
  client: Client,
  options: { status?: BugReportStatus; limit: number },
): Promise<BugReportRow[]> {
  let query = client
    .from("bug_reports")
    .select(
      "id, reporter_id, description, page_path, user_agent, status, created_at, updated_at",
    )
    .order("created_at", { ascending: false })
    .limit(options.limit);
  if (options.status) query = query.eq("status", options.status);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => ({ ...row, status: asStatus(row.status) }));
}

/**
 * Changes one report's status. RLS ("admin updates status") and the
 * column-level grant (status only) are the boundary; returns false when no
 * row was updated (not an admin, or no such report).
 */
export async function setBugReportStatus(
  client: Client,
  reportId: string,
  status: BugReportStatus,
): Promise<boolean> {
  const { data, error } = await client
    .from("bug_reports")
    .update({ status })
    .eq("id", reportId)
    .select("id");
  if (error) throw error;
  return Array.isArray(data) && data.length === 1;
}
