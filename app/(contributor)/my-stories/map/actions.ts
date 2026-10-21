"use server";

import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { setStoryParent } from "@/lib/story/mutations";
import { storyFolderErrorKey } from "@/lib/story/rpc-errors";
import { listMyStories } from "@/lib/story/contributor-queries";
import {
  invalidateStoryPublicCache,
  invalidateStoryListingsPublicCache,
} from "@/lib/story/public-cache";
import { getErrorMessage } from "@/lib/errors";
import { logAppEvent } from "@/lib/log";

export type StoryFolderActionResult =
  { ok: true } | { ok: false; error: string };

const storyIdSchema = z.uuid();
const parentIdSchema = z.uuid().nullable();

/**
 * Invalidates every public story page that could have changed, the way
 * every other mutation that changes public visibility does
 * (lib/story/public-cache.ts's header): re-derive each slug from the
 * owner-scoped list_my_stories() -- never trust a client-supplied slug.
 * Up to three stories can be affected by one call: the story being filed,
 * its new parent (if any), and its OLD parent (if it was re-filed away from
 * one) -- a folder link is public immediately, same as every earlier
 * design, so a reader hitting any of these pages right after must see the
 * change too.
 */
async function invalidateFolderPublicCache(storyIds: Array<string | null>) {
  const ids = storyIds.filter((id): id is string => id !== null);
  if (ids.length === 0) return;
  try {
    const mine = await listMyStories();
    const bySlug = new Map(mine.map((s) => [s.id, s.slug]));
    const slugs = ids.map((id) => bySlug.get(id));
    for (const slug of slugs) {
      if (slug) invalidateStoryPublicCache(slug);
    }
    if (slugs.some((s) => !s)) invalidateStoryListingsPublicCache();
  } catch {
    // Same "never let a cache hiccup look like a failed mutation" contract
    // as public-cache.ts's own callers -- the write already committed by
    // the time this runs.
    invalidateStoryListingsPublicCache();
  }
}

/**
 * Backs the story folders view's drag-to-file gesture, its Move-to
 * menu/select fallback, and the "Remove from folder" action (null parentId)
 * -- app/(contributor)/my-stories/map/story-folders-view.tsx. Only the ids'
 * SHAPE is checked here -- who may do it and whether the filing is allowed
 * (owner of both, both published, one level only) is re-derived by
 * set_story_parent() from the database, never taken from the client
 * (Engineering Rule 2). Its refusals (WHV10/WHV11/WHV13/WHV14/WHV15) map to
 * translated messages via storyFolderErrorKey.
 *
 * previousParentId, when given, is the story's parent BEFORE this call (so
 * a re-filing invalidates that story's old public page too, not just the
 * new one) -- the client already has this from its own state, and
 * set_story_parent() doesn't return it.
 */
export async function setStoryParentAction(
  storyId: unknown,
  parentId: unknown,
  previousParentId?: unknown,
): Promise<StoryFolderActionResult> {
  const [tErr, tCommon] = await Promise.all([
    getTranslations("actionErrors"),
    getTranslations("common"),
  ]);
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: tCommon("mustBeSignedIn") };
  }

  const parsedStory = storyIdSchema.safeParse(storyId);
  const parsedParent = parentIdSchema.safeParse(parentId);
  const parsedPreviousParent = parentIdSchema.safeParse(
    previousParentId ?? null,
  );
  if (!parsedStory.success || !parsedParent.success) {
    return { ok: false, error: tErr("invalidStory") };
  }

  try {
    await setStoryParent(parsedStory.data, parsedParent.data);
  } catch (error) {
    const key = storyFolderErrorKey(error);
    return {
      ok: false,
      error: key ? tErr(key) : getErrorMessage(error, tErr("generic")),
    };
  }

  revalidatePath("/my-stories/map");
  revalidatePath("/my-stories");
  await invalidateFolderPublicCache([
    parsedStory.data,
    parsedParent.data,
    parsedPreviousParent.success ? parsedPreviousParent.data : null,
  ]);
  logAppEvent({
    event: parsedParent.data ? "story.folder.set" : "story.folder.cleared",
    target: parsedStory.data,
    outcome: "success",
    detail: parsedParent.data ?? undefined,
  });
  return { ok: true };
}
