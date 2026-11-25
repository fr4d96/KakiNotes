"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserRole, resolveStaffAccess } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  moderateDecisionSchema,
  approveStorySchema,
  archiveStorySchema,
} from "@/lib/validation/moderation";
import {
  moderateRevision,
  archiveStory,
  getStoryForModerator,
} from "@/lib/story/moderation";
import {
  approveRevision,
  invalidateListingsCacheSafely,
  invalidatePublicCacheSafely,
} from "@/lib/story/approve-revision";
import { logStaffAction } from "@/lib/log";
import { getErrorMessage } from "@/lib/errors";

export type ModerationActionState = { error?: string; success?: string };

/**
 * Every action in this file independently re-checks moderator/admin here --
 * Server Actions are reachable regardless of which page rendered them, so
 * the (moderation) route group's layout guard alone is never sufficient
 * (same hard constraint app/(editor)/editorial/[id]/editorial-actions.ts
 * already documents). The underlying RPCs re-check server-side too; this is
 * defense in depth, not a substitute.
 */
async function requireModeratorOrAdmin(): Promise<string | null> {
  const role = await getCurrentUserRole();
  const access = resolveStaffAccess(role, ["moderator", "admin"]);
  return access.ok
    ? null
    : "Only a moderator or admin can perform this action.";
}

/**
 * Approve = the shared lib/story/approve-revision.ts path (begin -> copy
 * photos -> finalize -> refresh the public pages). The queue's bulk approve
 * (../actions.ts) runs the very same function, so the two can't diverge.
 */
export async function approveStoryAction(
  _prevState: ModerationActionState,
  formData: FormData,
): Promise<ModerationActionState> {
  const authError = await requireModeratorOrAdmin();
  if (authError) return { error: authError };

  const parsed = approveStorySchema.safeParse({
    revisionId: formData.get("revisionId"),
    storyId: formData.get("storyId"),
    userFacingReason: formData.get("userFacingReason") ?? "",
    editorNote: formData.get("editorNote") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const result = await approveRevision({
    revisionId: parsed.data.revisionId,
    expectedStoryId: parsed.data.storyId,
    userFacingReason: parsed.data.userFacingReason,
    editorNote: parsed.data.editorNote,
    actorId: (await getCurrentUser())?.id ?? null,
    action: "moderation.approve",
  });
  if (!result.ok) return { error: result.error };

  revalidatePath(`/moderation/stories/${parsed.data.revisionId}`);
  revalidatePath("/moderation/stories");
  return { success: "Story approved and published." };
}

export async function moderateDecisionAction(
  _prevState: ModerationActionState,
  formData: FormData,
): Promise<ModerationActionState> {
  const authError = await requireModeratorOrAdmin();
  if (authError) return { error: authError };

  const parsed = moderateDecisionSchema.safeParse({
    revisionId: formData.get("revisionId"),
    expectedVersion: Number(formData.get("expectedVersion")),
    decision: formData.get("decision"),
    userFacingReason: formData.get("userFacingReason"),
    editorNote: formData.get("editorNote") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const actorId = (await getCurrentUser())?.id ?? null;

  try {
    await moderateRevision({
      revisionId: parsed.data.revisionId,
      expectedVersion: parsed.data.expectedVersion,
      decision: parsed.data.decision,
      userFacingReason: parsed.data.userFacingReason,
      editorNote: parsed.data.editorNote || undefined,
    });
  } catch (error) {
    logStaffAction({
      actor: actorId,
      action: `moderation.${parsed.data.decision}`,
      target: parsed.data.revisionId,
      outcome: "error",
    });
    return {
      error: getErrorMessage(error, "Could not record this decision."),
    };
  }

  logStaffAction({
    actor: actorId,
    action: `moderation.${parsed.data.decision}`,
    target: parsed.data.revisionId,
    outcome: "success",
  });
  revalidatePath(`/moderation/stories/${parsed.data.revisionId}`);
  revalidatePath("/moderation/stories");
  return {
    success:
      parsed.data.decision === "reject"
        ? "Revision rejected."
        : "Changes requested.",
  };
}

/**
 * Archive/unpublish. Re-derives the story's slug server-side via
 * getStoryForModerator(revisionId) rather than trusting a client-supplied
 * slug (Engineering Rule 2) -- get_story_for_moderator() is the only
 * moderator-accessible source of a story's slug as of Stage 2 (see
 * supabase/migrations/20260805110000_moderator_story_detail_slug_version.sql,
 * NOT yet pushed).
 */
export async function archiveStoryAction(
  _prevState: ModerationActionState,
  formData: FormData,
): Promise<ModerationActionState> {
  const authError = await requireModeratorOrAdmin();
  if (authError) return { error: authError };

  const parsed = archiveStorySchema.safeParse({
    storyId: formData.get("storyId"),
    revisionId: formData.get("revisionId"),
    expectedVersion: Number(formData.get("expectedVersion")),
    reason: formData.get("reason"),
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const actorId = (await getCurrentUser())?.id ?? null;

  // Archiving can still proceed even if this revision lookup fails or comes
  // back mismatched -- the common case is archiving a long-published story
  // with no in-flight revision at all, which get_story_for_moderator() has no
  // row for. What must NOT happen is what used to happen here: the failure
  // was swallowed silently, slug stayed null, and the cache invalidation below
  // was skipped ENTIRELY, leaving a just-archived story publicly visible for
  // up to 60s on /stories and / and up to an hour in the sitemap (Engineering
  // Rule 12). Now the slug only decides WHICH surfaces get purged, never
  // whether any do, and the lookup failure is logged rather than dropped.
  // (approveStoryAction returns a hard error on its equivalent failure; that
  // is not right for archive, where the mutation is still valid without it.)
  let slug: string | null = null;
  try {
    const rows = await getStoryForModerator(parsed.data.revisionId);
    const detail = rows[0];
    if (detail && detail.story_id === parsed.data.storyId) {
      slug = detail.slug;
    } else {
      logStaffAction({
        actor: actorId,
        action: "moderation.archive.slug_lookup",
        target: parsed.data.storyId,
        outcome: "error",
        detail: detail
          ? "revision does not belong to this story"
          : "no moderator-visible revision for this story",
      });
    }
  } catch (error) {
    logStaffAction({
      actor: actorId,
      action: "moderation.archive.slug_lookup",
      target: parsed.data.storyId,
      outcome: "error",
      detail: getErrorMessage(error, "unknown error"),
    });
  }

  try {
    await archiveStory({
      storyId: parsed.data.storyId,
      expectedVersion: parsed.data.expectedVersion,
      reason: parsed.data.reason,
      note: parsed.data.note || undefined,
    });
  } catch (error) {
    logStaffAction({
      actor: actorId,
      action: "moderation.archive",
      target: parsed.data.storyId,
      outcome: "error",
    });
    return {
      error: getErrorMessage(error, "Could not archive this story."),
    };
  }

  if (slug) {
    invalidatePublicCacheSafely(slug, "moderation.archive");
  } else {
    invalidateListingsCacheSafely(parsed.data.storyId, "moderation.archive");
  }
  logStaffAction({
    actor: actorId,
    action: "moderation.archive",
    target: parsed.data.storyId,
    outcome: "success",
  });
  revalidatePath(`/moderation/stories/${parsed.data.revisionId}`);
  revalidatePath("/moderation/stories");
  return { success: "Story archived." };
}
