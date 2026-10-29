"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { isDriveConfigured } from "@/lib/env.server";
import {
  DriveMoveFatalError,
  beginDriveMoveRun,
  finishDriveMoveRun,
  moveNextPhotoToDrive,
} from "@/lib/story/media-move";
import { invalidateStoryListingsPublicCache } from "@/lib/story/public-cache";
import { driveMoveRunIdSchema } from "@/lib/validation/drive";

/**
 * "Move my existing photos to Drive" (docs/google-drive-integration.md
 * section 9). The Drive tab calls start once, then step once per photo
 * until it reports done, then finish. Each call is one short request, so
 * the 60s maxDuration on app/(contributor)/account/page.tsx covers it.
 *
 * Who may move what is decided entirely by the database (the RPCs re-derive
 * the signed-in owner, the run and an active Drive connection on every
 * call); the only thing taken from the browser is the run id, and a run id
 * that isn't the caller's own running run is refused there.
 */

export type StartDriveMoveResult =
  { ok: true; runId: string; total: number } | { ok: false; error: string };

export type DriveMoveStepResult =
  | { ok: true; done: true }
  | { ok: true; done: false; moved: true }
  | { ok: true; done: false; moved: false; storyTitle: string; reason: string }
  | { ok: false; error: string };

export type FinishDriveMoveResult = { ok: true } | { ok: false; error: string };

type Translator = Awaited<ReturnType<typeof getTranslations>>;

async function guard(): Promise<{ t: Translator; error?: string }> {
  const [t, tCommon] = await Promise.all([
    getTranslations("account.drive.move"),
    getTranslations("common"),
  ]);
  const user = await getCurrentUser();
  if (!user) return { t, error: tCommon("mustBeSignedIn") };
  if (!isDriveConfigured()) return { t, error: t("errors.notAvailable") };
  return { t };
}

function errorMessage(t: Translator, err: unknown): string {
  if (err instanceof DriveMoveFatalError) {
    return t(`errors.${err.reason}`);
  }
  console.error("Move to Drive action failed", err);
  return t("errors.generic");
}

export async function startDriveMoveAction(): Promise<StartDriveMoveResult> {
  const { t, error } = await guard();
  if (error) return { ok: false, error };
  try {
    const { runId, total } = await beginDriveMoveRun();
    return { ok: true, runId, total };
  } catch (err) {
    return { ok: false, error: errorMessage(t, err) };
  }
}

export async function moveNextDrivePhotoAction(
  runId: string,
): Promise<DriveMoveStepResult> {
  const { t, error } = await guard();
  if (error) return { ok: false, error };
  const parsed = driveMoveRunIdSchema.safeParse(runId);
  if (!parsed.success) return { ok: false, error: t("errors.generic") };

  try {
    const step = await moveNextPhotoToDrive(parsed.data);
    if (step.done) return { ok: true, done: true };
    if (step.outcome === "moved") {
      if (step.hadPublicCopy) {
        // A published photo's URL just changed from the public bucket to
        // /media/<id>. Story pages aren't cached, but `/` caches its story
        // list (covers included) -- refresh it now, well inside the 5
        // minutes the old copy is kept for.
        try {
          invalidateStoryListingsPublicCache();
        } catch (cacheErr) {
          console.error("Cache invalidation after a move failed", cacheErr);
        }
      }
      return { ok: true, done: false, moved: true };
    }
    return {
      ok: true,
      done: false,
      moved: false,
      storyTitle: step.storyTitle || t("untitledStory"),
      reason: t(`reasons.${step.reason}`),
    };
  } catch (err) {
    return { ok: false, error: errorMessage(t, err) };
  }
}

export async function finishDriveMoveAction(
  runId: string,
): Promise<FinishDriveMoveResult> {
  const { t, error } = await guard();
  if (error) return { ok: false, error };
  const parsed = driveMoveRunIdSchema.safeParse(runId);
  if (!parsed.success) return { ok: false, error: t("errors.generic") };

  try {
    await finishDriveMoveRun(parsed.data);
    revalidatePath("/account");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(t, err) };
  }
}
