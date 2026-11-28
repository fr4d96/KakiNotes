"use server";

import { getTranslations } from "next-intl/server";
import {
  checkBugListRateLimit,
  rateLimitRetryMinutes,
  recordBugListFailure,
} from "@/lib/rate-limit";
import { createPublicClient } from "@/lib/supabase/public";
import { firstIssueMessage } from "@/lib/validation/issue-messages";
import {
  bugListPasswordSchema,
  bugListResponseSchema,
  type ListedBug,
} from "@/lib/validation/bug-list";

export type BugListResult =
  { ok: true; reports: ListedBug[] } | { ok: false; error: string };

/**
 * Opens the Bug Lists pop-up: checks the password and returns the reports.
 *
 * The password is checked by list_bug_reports_with_passcode() in the
 * database, against a bcrypt hash; it is never stored in this repository or
 * compared here. That function returns only what the pop-up shows -- never
 * a reporter id or user agent -- and locks itself after 30 wrong passwords
 * in 15 minutes. This action adds a per-IP limit on wrong passwords first.
 *
 * Read-only: nothing here changes a report.
 */
export async function openBugListAction(
  password: unknown,
): Promise<BugListResult> {
  const [t, tv] = await Promise.all([
    getTranslations("bugList"),
    getTranslations("validation"),
  ]);

  const parsed = bugListPasswordSchema.safeParse(password);
  if (!parsed.success) {
    return {
      ok: false,
      error: firstIssueMessage(parsed.error, tv, "common.invalidInput"),
    };
  }

  const verdict = await checkBugListRateLimit();
  if (!verdict.allowed) {
    return {
      ok: false,
      error: t("errors.rateLimited", {
        minutes: rateLimitRetryMinutes(verdict.retryAfterSeconds),
      }),
    };
  }

  let response;
  try {
    const { data, error } = await createPublicClient().rpc(
      "list_bug_reports_with_passcode",
      { p_passcode: parsed.data },
    );
    if (error) throw error;
    response = bugListResponseSchema.parse(data);
  } catch {
    return { ok: false, error: t("errors.loadFailed") };
  }

  if (!response.ok) {
    if (response.reason === "invalid") {
      await recordBugListFailure();
      return { ok: false, error: t("errors.wrongPassword") };
    }
    if (response.reason === "rate_limited") {
      return {
        ok: false,
        error: t("errors.rateLimited", {
          minutes: rateLimitRetryMinutes(response.retry_after_seconds ?? 900),
        }),
      };
    }
    return { ok: false, error: t("errors.notConfigured") };
  }

  return {
    ok: true,
    reports: response.reports.map((row) => ({
      id: row.id,
      description: row.description,
      pagePath: row.page_path,
      status: row.status,
      createdAt: row.created_at,
    })),
  };
}
