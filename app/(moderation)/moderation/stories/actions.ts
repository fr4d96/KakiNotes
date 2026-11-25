"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserRole, resolveStaffAccess } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { bulkApproveSchema } from "@/lib/validation/moderation";
import {
  approveRevision,
  invalidateListingsCacheSafely,
} from "@/lib/story/approve-revision";
import { bulkApproveBlocker } from "@/lib/story/bulk-approve";
import type { BulkApproveResult } from "@/lib/story/bulk-approve-chunk";
import { getErrorMessage } from "@/lib/errors";

export type BulkApproveResponse =
  { results: BulkApproveResult[] } | { error: string };

/**
 * Approve and publish several submitted revisions, one after another, each
 * through exactly the path a single approval takes
 * (lib/story/approve-revision.ts). One story failing never stops the next:
 * every id gets its own result, with the reason in words.
 *
 * Takes revision ids only (Engineering Rule 2). Sequential on purpose: a
 * story can copy a dozen photos between buckets, and several at once from
 * one function would race for the same memory and time.
 */
export async function approveStoriesAction(
  revisionIds: string[],
): Promise<BulkApproveResponse> {
  // Server Actions are reachable whatever page rendered them, so this file
  // checks the role itself, as ./[id]/actions.ts does.
  const access = resolveStaffAccess(await getCurrentUserRole(), [
    "moderator",
    "admin",
  ]);
  if (!access.ok) {
    return { error: "Only a moderator or admin can perform this action." };
  }

  const parsed = bulkApproveSchema.safeParse(revisionIds);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const actorId = (await getCurrentUser())?.id ?? null;
  const results: BulkApproveResult[] = [];
  let photoPurgeDue = false;

  for (const revisionId of parsed.data) {
    try {
      const result = await approveRevision({
        revisionId,
        actorId,
        action: "moderation.bulk_approve",
        blocker: bulkApproveBlocker,
        deferPhotoPurge: true,
      });
      if (result.ok && result.photoPurgeDue) photoPurgeDue = true;
      results.push({
        revisionId,
        title: result.title,
        ok: result.ok,
        ...(result.ok ? {} : { error: result.error }),
      });
    } catch (error) {
      // approveRevision reports failures rather than throwing; this is the
      // belt that keeps one surprise from hiding the others' results.
      results.push({
        revisionId,
        title: null,
        ok: false,
        error: getErrorMessage(error, "Could not approve this story."),
      });
    }
  }

  // One photo-cache purge for the request, not one per story.
  if (photoPurgeDue) {
    invalidateListingsCacheSafely("bulk", "moderation.bulk_approve");
  }
  if (results.some((result) => result.ok)) {
    revalidatePath("/moderation/stories");
    revalidatePath("/moderation");
  }
  return { results };
}
