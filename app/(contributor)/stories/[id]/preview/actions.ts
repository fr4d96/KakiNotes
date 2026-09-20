"use server";

import { getTranslations } from "next-intl/server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  submitRevisionSchema,
  keepStoryPrivateSchema,
  identifiablePeopleStates,
} from "@/lib/validation/story";
import {
  submitRevisionWithConsent,
  keepRevisionPrivate,
  getCurrentTermsVersion,
  requestEditorialChanges,
  declineEditorialPublication,
  createNextDraftRevision,
  reopenSubmissionForEditing,
} from "@/lib/story/mutations";
import { getErrorMessage } from "@/lib/errors";
import { firstIssueMessage } from "@/lib/validation/issue-messages";

export type ConsentActionState = { error?: string; success?: string };

async function requireSignedIn(): Promise<string | null> {
  const user = await getCurrentUser();
  if (user) return null;
  const t = await getTranslations("common");
  return t("mustBeSignedIn");
}

/**
 * Contributor/owner "account" consent-at-submission. Fetches the current
 * terms version server-side immediately before submitting -- minimizing the
 * staleness window before submit_revision_with_consent()'s own WHV01
 * mismatch check (the authoritative backstop either way).
 */
export async function submitOwnConsentAction(
  _prevState: ConsentActionState,
  formData: FormData,
): Promise<ConsentActionState> {
  const [tErr, tv] = await Promise.all([
    getTranslations("actionErrors"),
    getTranslations("validation"),
  ]);
  const authError = await requireSignedIn();
  if (authError) return { error: authError };

  const parsed = submitRevisionSchema.safeParse({
    revisionId: formData.get("revisionId"),
    expectedVersion: Number(formData.get("expectedVersion")),
    confirmationMethod: "account",
    publicationConfirmed: formData.get("publicationConfirmed") === "on",
    // Placeholder -- overwritten with a freshly-fetched value below. Present
    // here only so the schema's required field doesn't reject the form
    // payload before we've had a chance to fetch the real one.
    expectedTermsVersion: "pending",
    imageRightsConfirmed: formData.get("imageRightsConfirmed") === "on",
    identifiablePeopleState: identifiablePeopleStates.includes(
      formData.get("identifiablePeopleState") as never,
    )
      ? (formData.get(
          "identifiablePeopleState",
        ) as (typeof identifiablePeopleStates)[number])
      : "not_applicable",
    editorialAssistanceConfirmed:
      formData.get("editorialAssistanceConfirmed") === "on",
  });

  if (!parsed.success) {
    return {
      error: firstIssueMessage(parsed.error, tv, "common.invalidInput"),
    };
  }

  try {
    const expectedTermsVersion = await getCurrentTermsVersion();
    await submitRevisionWithConsent({ ...parsed.data, expectedTermsVersion });
  } catch (error) {
    return {
      error: getErrorMessage(error, tErr("submitFailed")),
    };
  }

  revalidatePath(`/stories/${formData.get("storyId")}/preview`);
  revalidatePath("/my-stories");
  // A submitted (or contributor-approved) story is no longer something to
  // keep looking at on this page -- it's back in the queue. Land the
  // contributor where they can see it move: My Stories, which already shows
  // a status badge for `pending_review`/`awaiting_contributor_approval`
  // (components/story/status-badge.tsx). redirect() throws internally, so
  // this never returns a state the form could render -- the `toast` query
  // param carries the confirmation across the redirect instead
  // (app/(contributor)/my-stories/submission-toast.tsx picks it up).
  redirect("/my-stories?toast=submitted");
}

/**
 * The private half of the submit step: the contributor finishes the story
 * and keeps it to themselves. No moderator sees it, because there is
 * nothing public for a moderator to protect.
 *
 * A deliberately much smaller mirror of submitOwnConsentAction above, and
 * the things it does NOT do are the interesting part:
 *
 *   * It does not read publicationConfirmed, imageRightsConfirmed or
 *     identifiablePeopleState off the form, because the private panel never
 *     asks those questions. They are consent to put a story, and someone's
 *     photograph, in front of the public (docs/content-governance.md), and
 *     recording an answer nobody was asked would be worse than not having
 *     one.
 *   * It does not fetch current_terms_version(). The terms govern
 *     publication; nothing is being published.
 *
 * What it keeps is the part that is about trust rather than publication:
 * the signed-in check, Zod at the boundary, and the optimistic-version
 * token. keep_revision_private() re-derives ownership, source_kind and
 * publication state itself and is the non-bypassable check either way
 * (Engineering Rules 2 and 3).
 */
export async function keepStoryPrivateAction(
  _prevState: ConsentActionState,
  formData: FormData,
): Promise<ConsentActionState> {
  const [tErr, tv] = await Promise.all([
    getTranslations("actionErrors"),
    getTranslations("validation"),
  ]);
  const authError = await requireSignedIn();
  if (authError) return { error: authError };

  const parsed = keepStoryPrivateSchema.safeParse({
    revisionId: formData.get("revisionId"),
    expectedVersion: Number(formData.get("expectedVersion")),
  });
  if (!parsed.success) {
    return {
      error: firstIssueMessage(parsed.error, tv, "common.invalidInput"),
    };
  }

  try {
    await keepRevisionPrivate(parsed.data);
  } catch (error) {
    return {
      error: getErrorMessage(error, tErr("savePrivateFailed")),
    };
  }

  revalidatePath(`/stories/${formData.get("storyId")}/preview`);
  revalidatePath("/my-stories");
  // Same landing spot as a public submission, for the same reason: the
  // story has left the "still writing it" phase, and My Stories is where
  // its new state is visible (a "Private" badge, from
  // app/(contributor)/my-stories/status-badge.tsx). redirect() throws
  // internally, so the confirmation travels as a `toast` query param rather
  // than as returned state this form could render.
  redirect("/my-stories?toast=kept-private");
}

export async function requestEditorialChangesAction(
  _prevState: ConsentActionState,
  formData: FormData,
): Promise<ConsentActionState> {
  const [tErr, tv] = await Promise.all([
    getTranslations("actionErrors"),
    getTranslations("validation"),
  ]);
  const authError = await requireSignedIn();
  if (authError) return { error: authError };

  const storyId = z.uuid().safeParse(formData.get("storyId"));
  const note = z
    .string()
    .trim()
    .min(1, "story.changeNoteRequired")
    .max(4000)
    .safeParse(formData.get("note"));
  if (!storyId.success) return { error: tErr("invalidStory") };
  if (!note.success) {
    return { error: firstIssueMessage(note.error, tv, "common.invalidInput") };
  }

  try {
    await requestEditorialChanges(storyId.data, note.data);
  } catch (error) {
    return {
      error: getErrorMessage(error, tErr("requestChangesFailed")),
    };
  }

  revalidatePath(`/stories/${storyId.data}/preview`);
  revalidatePath("/my-stories");
  return { success: "Requested changes from the editor." };
}

export async function declineEditorialPublicationAction(
  _prevState: ConsentActionState,
  formData: FormData,
): Promise<ConsentActionState> {
  const tErr = await getTranslations("actionErrors");
  const authError = await requireSignedIn();
  if (authError) return { error: authError };

  const storyId = z.uuid().safeParse(formData.get("storyId"));
  const note = z
    .string()
    .trim()
    .max(4000)
    .safeParse(formData.get("note") ?? "");
  if (!storyId.success) return { error: tErr("invalidStory") };
  if (!note.success) return { error: tErr("invalidNote") };

  try {
    await declineEditorialPublication(storyId.data, note.data);
  } catch (error) {
    return {
      error: getErrorMessage(error, tErr("declineFailed")),
    };
  }

  revalidatePath(`/stories/${storyId.data}/preview`);
  revalidatePath("/my-stories");
  return { success: "Declined." };
}

export type StartStoryRevisionResult =
  { ok: true; revisionId: string } | { ok: false; error: string };

/**
 * Backs "Edit" on a story that is already published (or that a moderator sent
 * back with changes requested), from My Stories and from the preview page —
 * the point where a contributor
 * starts a SECOND pass over a story that has no in-flight draft.
 *
 * create_next_draft_revision() (via lib/story/mutations.ts) copies the
 * published — or, if newer, the last rejected/changes-requested/withdrawn —
 * revision into a fresh draft and points the story at it. It deliberately
 * does NOT touch published_revision_id or a published lifecycle_status, and
 * submit_revision_with_consent() leaves both alone too for an
 * already-published story, so what the public sees keeps being the old
 * revision right through the second review; approve_revision() is the only
 * thing that swaps the pointer (Engineering Rule 11).
 *
 * The RPC is the real boundary: it re-derives the caller, refuses anyone but
 * the owner or assigned editor, refuses a story that already has an in-flight
 * revision, and refuses an archived story.
 */
export async function startStoryRevisionAction(
  storyId: string,
): Promise<StartStoryRevisionResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "You must be signed in." };
  }

  try {
    const revisionId = await createNextDraftRevision(storyId);
    return { ok: true, revisionId };
  } catch (error) {
    return {
      ok: false,
      error: getErrorMessage(error, "Could not start editing this story."),
    };
  }
}

export type ReopenForEditingResult =
  { ok: true; revisionId: string } | { ok: false; error: string };

/**
 * Backs "Edit anyway" on a story that is UNDER REVIEW -- from the editor's
 * not-editable screen, the preview page, and My Stories. The sibling of
 * startStoryRevisionAction() above, for the one case that one refuses: the
 * story already has an in-flight revision, but it is `submitted` and
 * frozen, not an editable draft.
 *
 * reopen_submission_for_editing() (via lib/story/mutations.ts) withdraws the
 * submitted revision -- it leaves the moderation queue, frozen forever as
 * `withdrawn` -- and copies it into a brand-new draft, atomically. The
 * contributor submits again, with fresh consent, when they are done. A
 * published story stays published throughout (Engineering Rule 11).
 *
 * The RPC is the real boundary: it re-derives the caller, refuses anyone
 * but the owner or assigned editor, refuses a revision that is no longer
 * `submitted`, and refuses one a moderator has already acted on.
 */
export async function reopenForEditingAction(
  storyId: string,
): Promise<ReopenForEditingResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "You must be signed in." };
  }
  const parsed = z.uuid().safeParse(storyId);
  if (!parsed.success) {
    return { ok: false, error: "Invalid story." };
  }

  try {
    const revisionId = await reopenSubmissionForEditing(parsed.data);
    revalidatePath(`/stories/${parsed.data}/preview`);
    revalidatePath("/my-stories");
    return { ok: true, revisionId };
  } catch (error) {
    return {
      ok: false,
      error: getErrorMessage(error, "Could not reopen this story for editing."),
    };
  }
}
