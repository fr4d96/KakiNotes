import { z } from "zod";

/**
 * Bug reports (supabase/migrations/20261128090000_bug_reports.sql).
 *
 * The limits mirror that migration's CHECK constraints: Zod gives a friendly
 * message, the constraint and submit_bug_report() are the non-bypassable
 * word (Engineering Rule 3). Messages are keys into `validation.bugReport`.
 *
 * Plain text only: a description is only ever rendered as React text with
 * `white-space: pre-wrap`, never as HTML (Rule 7).
 */
export const BUG_REPORT_MIN = 10;
export const BUG_REPORT_MAX = 2000;
export const BUG_REPORT_PATH_MAX = 500;
export const BUG_REPORT_USER_AGENT_MAX = 500;
export const BUG_REPORT_STATUSES = [
  "open",
  "triaged",
  "fixed",
  "wontfix",
] as const;
export type BugReportStatus = (typeof BUG_REPORT_STATUSES)[number];

/** The hidden field a person never fills in and a form-stuffing bot does. */
export const BUG_REPORT_HONEYPOT_FIELD = "website";

/**
 * Reduces whatever the browser sent as "the page" to a safe pathname, or
 * undefined. Drops the origin, query string and hash (a reset-password code
 * or any other secret rides there), and redacts the one path segment that
 * is itself a capability: an affirmation link's token (/notes/<token>).
 * Anything that is not a same-site absolute path is dropped, not rejected:
 * the path is context, and a report is still worth having without it.
 */
export function sanitizeBugReportPath(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return undefined;
  const pathname = trimmed.split(/[?#]/, 1)[0] ?? "";
  const redacted = pathname.replace(/^\/notes\/[^/]+/, "/notes/[token]");
  if (!redacted || redacted.length > BUG_REPORT_PATH_MAX) return undefined;
  return redacted;
}

export const submitBugReportSchema = z.object({
  description: z
    .string("bugReport.descriptionRequired")
    .trim()
    .min(1, "bugReport.descriptionRequired")
    .min(BUG_REPORT_MIN, "bugReport.descriptionTooShort")
    .max(BUG_REPORT_MAX, "bugReport.descriptionTooLong"),
  pagePath: z.any().optional().transform(sanitizeBugReportPath),
});

export type SubmitBugReportInput = z.infer<typeof submitBugReportSchema>;

export const updateBugReportStatusSchema = z.object({
  reportId: z.uuid("Invalid report."),
  status: z.enum(BUG_REPORT_STATUSES, "Invalid status."),
});
