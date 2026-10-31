"use server";

import { getTranslations } from "next-intl/server";
import { createPublicClient } from "@/lib/supabase/public";
import {
  checkAffirmationRateLimit,
  recordAffirmationAttempt,
  rateLimitRetryMinutes,
} from "@/lib/rate-limit";
import { firstIssueMessage } from "@/lib/validation/issue-messages";
import {
  AFFIRMATION_HONEYPOT_FIELD,
  submitAffirmationNoteSchema,
} from "@/lib/validation/affirmation";

export type AffirmationNoteFormState = {
  error?: string;
  sent?: boolean;
};

/**
 * An ANONYMOUS submission: anyone holding a share link, no account.
 *
 * Order matters:
 *
 * 1. Honeypot. A filled hidden field means a bot; it is told "sent" and
 *    nothing is inserted, counted, or looked up -- no signal to learn from.
 * 2. Zod. Plain text only; limits mirror the table's CHECKs.
 * 3. Rate limit (per IP, then per link token). Counted for every attempt
 *    that gets this far, valid token or not, so the throttle itself reveals
 *    nothing about whether a token exists.
 * 4. submit_affirmation_note(), a SECURITY DEFINER RPC that resolves the
 *    link from the token itself. This action never sees or sends an owner or
 *    link id (Engineering Rule 2).
 *
 * EVERY failure after validation -- unknown token, switched-off link, RPC or
 * network error -- returns the same message, so this form is not an oracle
 * for which tokens exist.
 */
export async function submitAffirmationNoteAction(
  _prevState: AffirmationNoteFormState,
  formData: FormData,
): Promise<AffirmationNoteFormState> {
  if (String(formData.get(AFFIRMATION_HONEYPOT_FIELD) ?? "").trim() !== "") {
    return { sent: true };
  }

  const [t, tv] = await Promise.all([
    getTranslations("affirmationWrite"),
    getTranslations("validation"),
  ]);

  const parsed = submitAffirmationNoteSchema.safeParse({
    token: formData.get("token"),
    body: formData.get("body"),
    authorName: formData.get("authorName") ?? undefined,
  });
  if (!parsed.success) {
    // A bad token is reported as the generic failure, not as "invalid
    // link": the field is hidden and a person never gets it wrong.
    const tokenIssue = parsed.error.issues.some(
      (issue) => issue.path[0] === "token",
    );
    return {
      error: tokenIssue
        ? t("errors.sendFailed")
        : firstIssueMessage(parsed.error, tv, "common.invalidInput"),
    };
  }

  const { token, body, authorName } = parsed.data;

  const verdict = await checkAffirmationRateLimit(token);
  if (!verdict.allowed) {
    return {
      error: t("errors.rateLimited", {
        minutes: rateLimitRetryMinutes(verdict.retryAfterSeconds),
      }),
    };
  }
  await recordAffirmationAttempt(token);

  try {
    const { error } = await createPublicClient().rpc(
      "submit_affirmation_note",
      {
        p_token: token,
        p_body: body,
        // Omitted (not null) when empty: the generated arg type is
        // `p_author_name?: string`, and the function's default is null.
        p_author_name: authorName ?? undefined,
      },
    );
    if (error) throw error;
  } catch {
    return { error: t("errors.sendFailed") };
  }

  return { sent: true };
}
