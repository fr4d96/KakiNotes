"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { createClient } from "@/lib/supabase/server";
import { getErrorMessage } from "@/lib/errors";
import { firstIssueMessage } from "@/lib/validation/issue-messages";
import {
  AFFIRMATION_LINK_MAX,
  createAffirmationLinkSchema,
  deleteAffirmationLinkSchema,
  deleteAffirmationNoteSchema,
  renameAffirmationLinkSchema,
  toggleAffirmationLinkSchema,
} from "@/lib/validation/affirmation";

export type AffirmationFormState = {
  error?: string;
  /** Changes on every success so a form can react once per success. */
  savedAt?: string;
};

export type AffirmationActionResult =
  { ok: true } | { ok: false; error: string };

/**
 * Every action below follows the same contract:
 *
 * - The caller comes from the session (getCurrentUser), never the request.
 *   No owner id is accepted from the client at all (Engineering Rule 2).
 * - Ownership is enforced by RLS on affirmation_links / affirmation_notes
 *   ("owner updates own links" etc.), not by a client-supplied filter: an id
 *   belonging to someone else matches no row. Writes ask for the affected
 *   ids back so "matched nothing" is reported instead of a false success.
 * - Link creation is the create_affirmation_link() RPC, which picks the
 *   token and the owner itself; there is no INSERT grant on the table.
 */
export async function createAffirmationLinkAction(
  _prevState: AffirmationFormState,
  formData: FormData,
): Promise<AffirmationFormState> {
  const [t, tv, tCommon] = await Promise.all([
    getTranslations("affirmations"),
    getTranslations("validation"),
    getTranslations("common"),
  ]);
  const user = await getCurrentUser();
  if (!user) return { error: tCommon("mustBeSignedIn") };

  const parsed = createAffirmationLinkSchema.safeParse({
    label: formData.get("label") ?? undefined,
  });
  if (!parsed.success) {
    return {
      error: firstIssueMessage(parsed.error, tv, "common.invalidInput"),
    };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("create_affirmation_link", {
      // Omitted (not null) when empty: the generated arg type is
      // `p_label?: string`, and the function's default is null.
      p_label: parsed.data.label ?? undefined,
    });
    if (error) throw error;
  } catch (error) {
    if (getErrorMessage(error, "").includes("affirmation_link_limit")) {
      return { error: t("errors.linkLimit", { max: AFFIRMATION_LINK_MAX }) };
    }
    return { error: t("errors.createFailed") };
  }

  revalidatePath("/affirmations");
  return { savedAt: new Date().toISOString() };
}

export async function renameAffirmationLinkAction(
  _prevState: AffirmationFormState,
  formData: FormData,
): Promise<AffirmationFormState> {
  const [t, tv, tCommon] = await Promise.all([
    getTranslations("affirmations"),
    getTranslations("validation"),
    getTranslations("common"),
  ]);
  const user = await getCurrentUser();
  if (!user) return { error: tCommon("mustBeSignedIn") };

  const parsed = renameAffirmationLinkSchema.safeParse({
    linkId: formData.get("linkId"),
    label: formData.get("label") ?? undefined,
  });
  if (!parsed.success) {
    return {
      error: firstIssueMessage(parsed.error, tv, "common.invalidInput"),
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("affirmation_links")
    .update({ label: parsed.data.label ?? null })
    .eq("id", parsed.data.linkId)
    .select("id");
  if (error || !data || data.length === 0) {
    return { error: t("errors.updateFailed") };
  }

  revalidatePath("/affirmations");
  return { savedAt: new Date().toISOString() };
}

export async function setAffirmationLinkActiveAction(
  linkId: string,
  isActive: boolean,
): Promise<AffirmationActionResult> {
  const [t, tCommon] = await Promise.all([
    getTranslations("affirmations"),
    getTranslations("common"),
  ]);
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: tCommon("mustBeSignedIn") };

  const parsed = toggleAffirmationLinkSchema.safeParse({ linkId, isActive });
  if (!parsed.success) return { ok: false, error: t("errors.updateFailed") };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("affirmation_links")
    .update({ is_active: parsed.data.isActive })
    .eq("id", parsed.data.linkId)
    .select("id");
  if (error || !data || data.length === 0) {
    return { ok: false, error: t("errors.updateFailed") };
  }

  revalidatePath("/affirmations");
  return { ok: true };
}

/** Deleting a link cascades to its notes (FK on delete cascade). */
export async function deleteAffirmationLinkAction(
  linkId: string,
): Promise<AffirmationActionResult> {
  const [t, tCommon] = await Promise.all([
    getTranslations("affirmations"),
    getTranslations("common"),
  ]);
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: tCommon("mustBeSignedIn") };

  const parsed = deleteAffirmationLinkSchema.safeParse({ linkId });
  if (!parsed.success) return { ok: false, error: t("errors.deleteFailed") };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("affirmation_links")
    .delete()
    .eq("id", parsed.data.linkId)
    .select("id");
  if (error || !data || data.length === 0) {
    return { ok: false, error: t("errors.deleteFailed") };
  }

  revalidatePath("/affirmations");
  return { ok: true };
}

export async function deleteAffirmationNoteAction(
  noteId: string,
): Promise<AffirmationActionResult> {
  const [t, tCommon] = await Promise.all([
    getTranslations("affirmations"),
    getTranslations("common"),
  ]);
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: tCommon("mustBeSignedIn") };

  const parsed = deleteAffirmationNoteSchema.safeParse({ noteId });
  if (!parsed.success) return { ok: false, error: t("errors.deleteFailed") };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("affirmation_notes")
    .delete()
    .eq("id", parsed.data.noteId)
    .select("id");
  if (error || !data || data.length === 0) {
    return { ok: false, error: t("errors.deleteFailed") };
  }

  revalidatePath("/affirmations");
  return { ok: true };
}
