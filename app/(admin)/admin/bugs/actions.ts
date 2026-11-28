"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getCurrentUserRole, resolveStaffAccess } from "@/lib/auth/roles";
import { setBugReportStatus } from "@/lib/bug-reports/db";
import { logStaffAction } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";
import { updateBugReportStatusSchema } from "@/lib/validation/bug-report";

export type BugStatusActionState = { error?: string; success?: string };

/**
 * Changes one report's status (open / triaged / fixed / wontfix). Only a
 * label for the owner's own triage: nothing else happens when it changes.
 *
 * Re-checks admin here (defence in depth, same as setUserRoleAction); the
 * real boundary is RLS ("bug_reports: admin updates status") plus the
 * column-level grant that lets nobody touch anything but `status`.
 */
export async function updateBugReportStatusAction(
  _prevState: BugStatusActionState,
  formData: FormData,
): Promise<BugStatusActionState> {
  const access = resolveStaffAccess(await getCurrentUserRole(), ["admin"]);
  if (!access.ok) return { error: "Only an admin can change a bug report." };

  const parsed = updateBugReportStatusSchema.safeParse({
    reportId: formData.get("reportId"),
    status: formData.get("status"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const actor = (await getCurrentUser())?.id ?? null;
  try {
    const updated = await setBugReportStatus(
      await createClient(),
      parsed.data.reportId,
      parsed.data.status,
    );
    if (!updated) return { error: "That report could not be updated." };
  } catch {
    logStaffAction({
      actor,
      action: "admin.set_bug_report_status",
      target: parsed.data.reportId,
      outcome: "error",
    });
    return { error: "That report could not be updated." };
  }

  logStaffAction({
    actor,
    action: "admin.set_bug_report_status",
    target: parsed.data.reportId,
    outcome: "success",
  });
  revalidatePath("/admin/bugs");
  return { success: "Saved." };
}
