"use server";

import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  checkBugReportRateLimit,
  rateLimitRetryMinutes,
  recordBugReportAttempt,
} from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { firstIssueMessage } from "@/lib/validation/issue-messages";
import {
  BUG_REPORT_HONEYPOT_FIELD,
  BUG_REPORT_USER_AGENT_MAX,
  submitBugReportSchema,
} from "@/lib/validation/bug-report";
import { callSubmitBugReport } from "./db";

export type BugReportFormState = {
  error?: string;
  sent?: boolean;
};

/**
 * The Report a bug dialog's one write. Open to signed-out visitors too:
 * most of this site's readers never make an account, and a reader who hit
 * a broken page is exactly who should be able to say so.
 *
 * Order matters (same as submitAffirmationNoteAction):
 *
 * 1. Honeypot. A filled hidden field means a bot: it is told "sent" and
 *    nothing is inserted or counted.
 * 2. Zod. Plain text; limits mirror the table's CHECKs. The page path is
 *    reduced to a bare pathname (no query/hash, tokens redacted).
 * 3. Who is asking, from the SESSION (getCurrentUser), never the form
 *    (Engineering Rule 2). It only picks the rate-limit bucket here;
 *    submit_bug_report() takes reporter_id from auth.uid() itself.
 * 4. Rate limit, counted for every submission that gets this far.
 * 5. submit_bug_report() over the caller's own cookie session, so auth.uid()
 *    resolves for a signed-in reporter and is null otherwise.
 *
 * The user agent is read from the request headers, not sent by the dialog:
 * the server already has it, so there is nothing for a client to fake.
 */
export async function submitBugReportAction(
  _prevState: BugReportFormState,
  formData: FormData,
): Promise<BugReportFormState> {
  if (String(formData.get(BUG_REPORT_HONEYPOT_FIELD) ?? "").trim() !== "") {
    return { sent: true };
  }

  const [t, tv] = await Promise.all([
    getTranslations("bugReport"),
    getTranslations("validation"),
  ]);

  const parsed = submitBugReportSchema.safeParse({
    description: formData.get("description"),
    pagePath: formData.get("pagePath"),
  });
  if (!parsed.success) {
    return {
      error: firstIssueMessage(parsed.error, tv, "common.invalidInput"),
    };
  }

  const user = await getCurrentUser();
  const userId = user?.id ?? null;

  const verdict = await checkBugReportRateLimit(userId);
  if (!verdict.allowed) {
    return {
      error: t("errors.rateLimited", {
        minutes: rateLimitRetryMinutes(verdict.retryAfterSeconds),
      }),
    };
  }
  await recordBugReportAttempt(userId);

  let userAgent: string | undefined;
  try {
    userAgent =
      (await headers())
        .get("user-agent")
        ?.trim()
        .slice(0, BUG_REPORT_USER_AGENT_MAX) || undefined;
  } catch {
    userAgent = undefined;
  }

  try {
    const { error } = await callSubmitBugReport(await createClient(), {
      p_description: parsed.data.description,
      p_page_path: parsed.data.pagePath,
      p_user_agent: userAgent,
    });
    if (error) throw error;
  } catch {
    return { error: t("errors.sendFailed") };
  }

  return { sent: true };
}
