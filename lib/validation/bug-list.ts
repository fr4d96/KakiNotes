import { z } from "zod";
import { BUG_REPORT_STATUSES } from "@/lib/validation/bug-report";

/**
 * Bug Lists (supabase/migrations/20261128030826_bug_list_passcode.sql).
 * The password field, and the shape list_bug_reports_with_passcode()
 * returns -- parsed rather than trusted, like any other trust boundary.
 */
export const BUG_LIST_PASSWORD_MAX = 200;

export const bugListPasswordSchema = z
  .string("bugList.passwordRequired")
  .min(1, "bugList.passwordRequired")
  .max(BUG_LIST_PASSWORD_MAX, "bugList.passwordWrong");

const listedBugSchema = z.object({
  id: z.uuid(),
  description: z.string(),
  page_path: z.string().nullable(),
  // An unknown value (should never happen: a CHECK constraint) reads as open.
  status: z.enum(BUG_REPORT_STATUSES).catch("open"),
  created_at: z.string(),
});

export const bugListResponseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), reports: z.array(listedBugSchema) }),
  z.object({
    ok: z.literal(false),
    reason: z.enum(["invalid", "rate_limited", "not_configured"]),
    retry_after_seconds: z.number().int().positive().optional(),
  }),
]);

export type ListedBug = {
  id: string;
  description: string;
  pagePath: string | null;
  status: (typeof BUG_REPORT_STATUSES)[number];
  createdAt: string;
};
