"use server";

import { getTranslations } from "next-intl/server";

import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  revisionInputSchema,
  revisionLocationsSchema,
  revisionTagsSchema,
  revisionExpensesSchema,
  type RevisionInput,
} from "@/lib/validation/story";
import { getErrorMessage } from "@/lib/errors";
import { firstIssueMessage } from "@/lib/validation/issue-messages";
import {
  saveRevisionDraft,
  setRevisionLocations,
  setRevisionTags,
  setRevisionExpenses,
  updateStoryMediaCaption,
  reorderStoryMedia,
  setStoryCoverMedia,
  detachStoryMedia,
  cancelPendingStoryMediaUpload,
} from "@/lib/story/mutations";

/**
 * Every action here is invoked directly (not bound to a <form>) by
 * components/story/mutation-queue.ts, which enforces strict one-at-a-time
 * ordering and per-field coalescing client-side. Every action:
 *  - re-derives the caller from the session (never trusts a client-supplied
 *    identity — the underlying RPC re-derives it again independently, this
 *    is just a clean early "you must be signed in" error);
 *  - validates its input through the same Zod schemas the plain HTML form
 *    would use, never passing raw client data through to an RPC;
 *  - returns { ok: true } | { ok: false, error } rather than throwing, so
 *    the mutation queue's stale-version detection
 *    (isStaleVersionConflict, which pattern-matches the RPC's own "Stale
 *    version for ..." message) keeps working uniformly — the caller wraps
 *    a failed result back into a thrown Error before handing it to the
 *    queue. Ownership itself is never re-derived here from a client id: the
 *    revisionId in every call is authorized server-side by
 *    _authorize_revision_edit() inside the RPC, exactly like every other
 *    authoring mutation in this schema.
 */

export type MutationResult = { ok: true } | { ok: false; error: string };

/**
 * saveRevisionFieldsAction's success shape additionally carries the
 * authoritative new story.version (Prompt 4 Sub-phase 4:
 * save_revision_draft() now returns it instead of void) -- the only call
 * site that needs it, since every other mutation's underlying RPC has
 * nothing else useful to propagate back.
 */
export type SaveFieldsResult =
  { ok: true; version: number } | { ok: false; error: string };

async function errorMessage(error: unknown): Promise<string> {
  const t = await getTranslations("actionErrors");
  return getErrorMessage(error, t("generic"));
}

// Typed as the narrower "always ok:false" shape (it never actually returns
// ok:true) so it's assignable at every call site's own success-shaped
// return type, including saveRevisionFieldsAction's SaveFieldsResult, which
// requires an extra `version` field on its ok:true variant that this
// early-return path never needs to produce.
async function requireSignedIn(): Promise<{ ok: false; error: string } | null> {
  const user = await getCurrentUser();
  if (!user) {
    const t = await getTranslations("common");
    return { ok: false, error: t("mustBeSignedIn") };
  }
  return null;
}

export async function saveRevisionFieldsAction(
  revisionId: string,
  expectedVersion: number,
  input: RevisionInput,
): Promise<SaveFieldsResult> {
  const tv = await getTranslations("validation");
  const authError = await requireSignedIn();
  if (authError) return authError;

  const parsed = revisionInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: firstIssueMessage(parsed.error, tv, "common.invalidInput"),
    };
  }
  try {
    const version = await saveRevisionDraft(
      revisionId,
      expectedVersion,
      parsed.data,
    );
    return { ok: true, version };
  } catch (error) {
    return { ok: false, error: await errorMessage(error) };
  }
}

export async function setLocationsAction(
  revisionId: string,
  expectedVersion: number,
  locations: unknown,
): Promise<MutationResult> {
  const tv = await getTranslations("validation");
  const authError = await requireSignedIn();
  if (authError) return authError;

  const parsed = revisionLocationsSchema.safeParse(locations);
  if (!parsed.success) {
    return {
      ok: false,
      error: firstIssueMessage(parsed.error, tv, "common.invalidInput"),
    };
  }
  try {
    await setRevisionLocations(revisionId, expectedVersion, parsed.data);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: await errorMessage(error) };
  }
}

export async function setTagsAction(
  revisionId: string,
  expectedVersion: number,
  tags: unknown,
): Promise<MutationResult> {
  const tv = await getTranslations("validation");
  const authError = await requireSignedIn();
  if (authError) return authError;

  const parsed = revisionTagsSchema.safeParse(tags);
  if (!parsed.success) {
    return {
      ok: false,
      error: firstIssueMessage(parsed.error, tv, "common.invalidInput"),
    };
  }
  try {
    await setRevisionTags(revisionId, expectedVersion, parsed.data);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: await errorMessage(error) };
  }
}

/**
 * The optional per-category expense breakdown. Ownership is never taken
 * from the client here (there is no contributor/story id in the payload at
 * all) -- the revisionId is authorized server-side by
 * _authorize_revision_edit() inside set_revision_expenses(), exactly like
 * every other authoring mutation, and that same RPC re-applies the
 * amount/category/dedupe rules this schema checks.
 */
export async function setExpensesAction(
  revisionId: string,
  expectedVersion: number,
  expenses: unknown,
): Promise<MutationResult> {
  const tv = await getTranslations("validation");
  const authError = await requireSignedIn();
  if (authError) return authError;

  const parsed = revisionExpensesSchema.safeParse(expenses);
  if (!parsed.success) {
    return {
      ok: false,
      error: firstIssueMessage(parsed.error, tv, "common.invalidInput"),
    };
  }
  try {
    await setRevisionExpenses(revisionId, expectedVersion, parsed.data);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: await errorMessage(error) };
  }
}

const mediaCaptionInputSchema = z.object({
  revisionId: z.uuid(),
  mediaId: z.uuid(),
  expectedVersion: z.number().int(),
  altText: z.string().trim().max(500).nullable(),
  caption: z.string().trim().max(500).nullable(),
  decorative: z.boolean(),
});

export async function updateMediaCaptionAction(
  params: unknown,
): Promise<MutationResult> {
  const [tErr, tv] = await Promise.all([
    getTranslations("actionErrors"),
    getTranslations("validation"),
  ]);
  const authError = await requireSignedIn();
  if (authError) return authError;

  const parsed = mediaCaptionInputSchema.safeParse(params);
  if (!parsed.success) {
    return {
      ok: false,
      error: firstIssueMessage(parsed.error, tv, "common.invalidInput"),
    };
  }
  if (!parsed.data.decorative && !parsed.data.altText) {
    return {
      ok: false,
      error: tErr("altTextRequired"),
    };
  }
  try {
    await updateStoryMediaCaption(parsed.data);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: await errorMessage(error) };
  }
}

export async function reorderMediaAction(
  revisionId: string,
  expectedVersion: number,
  mediaOrder: unknown,
): Promise<MutationResult> {
  const tErr = await getTranslations("actionErrors");
  const authError = await requireSignedIn();
  if (authError) return authError;

  const parsed = z.array(z.uuid()).max(12).safeParse(mediaOrder);
  if (!parsed.success) {
    return { ok: false, error: tErr("invalidMediaOrder") };
  }
  try {
    await reorderStoryMedia(revisionId, expectedVersion, parsed.data);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: await errorMessage(error) };
  }
}

export async function setCoverAction(
  revisionId: string,
  expectedVersion: number,
  mediaId: string,
): Promise<MutationResult> {
  const tErr = await getTranslations("actionErrors");
  const authError = await requireSignedIn();
  if (authError) return authError;

  const parsed = z.uuid().safeParse(mediaId);
  if (!parsed.success) return { ok: false, error: tErr("invalidMedia") };
  try {
    await setStoryCoverMedia(revisionId, expectedVersion, parsed.data);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: await errorMessage(error) };
  }
}

/**
 * Detach only — this never deletes the underlying story_media row (Rule:
 * detach-and-retain is the only ordinary media-removal action, so a media
 * item reused elsewhere or still referenced by copy-attempt history is
 * never destroyed by an ordinary authoring action).
 */
export async function detachMediaAction(
  revisionId: string,
  expectedVersion: number,
  mediaId: string,
): Promise<MutationResult> {
  const tErr = await getTranslations("actionErrors");
  const authError = await requireSignedIn();
  if (authError) return authError;

  const parsed = z.uuid().safeParse(mediaId);
  if (!parsed.success) return { ok: false, error: tErr("invalidMedia") };
  try {
    await detachStoryMedia(revisionId, expectedVersion, parsed.data);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: await errorMessage(error) };
  }
}

export async function cancelPendingUploadAction(
  mediaId: string,
): Promise<MutationResult> {
  const tErr = await getTranslations("actionErrors");
  const authError = await requireSignedIn();
  if (authError) return authError;

  const parsed = z.uuid().safeParse(mediaId);
  if (!parsed.success) return { ok: false, error: tErr("invalidMedia") };
  try {
    await cancelPendingStoryMediaUpload(parsed.data);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: await errorMessage(error) };
  }
}
