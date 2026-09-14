"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { createDraftSchema } from "@/lib/validation/story";
import { getTranslations } from "next-intl/server";
import { firstIssueMessage } from "@/lib/validation/issue-messages";
import { createSelfServiceDraftShell } from "@/lib/story/mutations";
import { getErrorMessage } from "@/lib/errors";

export type NewStoryFormState = {
  error?: string;
};

export async function createDraftAction(
  _prevState: NewStoryFormState,
  formData: FormData,
): Promise<NewStoryFormState> {
  const [t, tv, tCommon] = await Promise.all([
    getTranslations("newStory"),
    getTranslations("validation"),
    getTranslations("common"),
  ]);
  const user = await getCurrentUser();
  if (!user) {
    return { error: tCommon("mustBeSignedIn") };
  }

  const parsed = createDraftSchema.safeParse({
    title: formData.get("title"),
  });
  if (!parsed.success) {
    return {
      error: firstIssueMessage(parsed.error, tv, "common.invalidInput"),
    };
  }

  let result: { story_id: string; revision_id: string } | null;
  try {
    result = await createSelfServiceDraftShell(parsed.data.title);
  } catch (error) {
    // getErrorMessage(), not `error instanceof Error` -- the Supabase
    // client can reject an RPC call with a plain PostgrestError-shaped
    // object ({ code, details, hint, message }) that fails that check
    // (confirmed live: create_self_service_draft()'s raised "You must set
    // up your contributor identity..." exception never matched the old
    // check, so every dev-account without a contributor row just saw the
    // generic fallback instead of the actionable message).
    if (/contributor identity/i.test(getErrorMessage(error, ""))) {
      return {
        error: t("errors.needsContributorIdentity"),
      };
    }
    return { error: t("errors.createFailed") };
  }

  if (!result?.story_id) {
    return { error: t("errors.createFailed") };
  }

  redirect(`/stories/${result.story_id}/edit`);
}
