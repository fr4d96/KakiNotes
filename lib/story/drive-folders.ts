import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  getAccessToken,
  ensureAppFolders,
  createFolder,
  getFileMetadata,
  listFolderChildren,
  renameFile,
  moveFile,
  renameAndMoveFile,
} from "@/lib/drive/drive-client";

/**
 * Per-story Drive folder organisation: one folder per story, inside the
 * contributor's "Kakinotes" app folder, named after the story's title, with
 * photos inside numbered by display order (01.jpg, 02.jpg, ...). Lives
 * beside lib/story/drive-sync.ts (not inside it) because it has a narrower
 * job -- naming/placement bookkeeping -- but follows the exact same
 * privilege shape: it imports lib/drive/drive-client.ts directly (allowed
 * from anywhere under lib/drive/** per eslint.config.mjs's existing
 * allowlist) and never lib/drive/token-store.ts or lib/supabase/admin.ts.
 * DB writes go through the ordinary session client calling the SECURITY
 * DEFINER RPCs in supabase/migrations/20261007190006_story_drive_folders.sql,
 * exactly like every other story mutation.
 */

const MAX_FOLDER_NAME_LENGTH = 100;
const FORBIDDEN_CHARS = /[/\\:*?"<>|]/g;

/**
 * Sanitizes a story title into a Drive folder name: trim, collapse
 * whitespace runs to a single space, strip characters Drive/OSes choke on,
 * cap at ~100 chars, and fall back to "Untitled story" for an empty result
 * (an empty title, or a title that is ONLY forbidden characters/whitespace).
 * Pure function -- no Drive or DB call, easy to unit test directly.
 */
export function sanitizeStoryFolderName(
  title: string | null | undefined,
): string {
  const stripped = (title ?? "").replace(FORBIDDEN_CHARS, " ");
  const collapsed = stripped.trim().replace(/\s+/g, " ");
  const truncated = collapsed.slice(0, MAX_FOLDER_NAME_LENGTH).trim();
  return truncated.length > 0 ? truncated : "Untitled story";
}

/**
 * Appends " (2)", " (3)", ... to `baseName` until it no longer collides
 * with any name in `takenNames` -- the caller is responsible for excluding
 * the story's own current name from `takenNames` when re-checking an
 * existing folder (a rename-to-the-same-name is never itself a collision).
 */
export function uniqueFolderName(
  baseName: string,
  takenNames: readonly string[],
): string {
  const taken = new Set(takenNames);
  if (!taken.has(baseName)) return baseName;
  let n = 2;
  while (taken.has(`${baseName} (${n})`)) {
    n += 1;
  }
  return `${baseName} (${n})`;
}

/** jpeg -> .jpg, png -> .png; anything else defaults to .jpg. */
export function extensionForMimeType(
  mimeType: string | null | undefined,
): string {
  if (mimeType === "image/png") return "png";
  return "jpg";
}

async function fetchStoryTitle(
  supabase: SupabaseClient,
  storyId: string,
): Promise<string> {
  const { data, error } = await supabase.rpc("get_story_preview", {
    p_story_id: storyId,
  });
  if (error || !data || data.length === 0) {
    throw new Error(
      `Could not read story ${storyId}'s title for its Drive folder: ${error?.message ?? "no such story"}`,
    );
  }
  return data[0].title ?? "";
}

/**
 * Shared by ensureStoryFolder (createIfMissing: true, used on the upload
 * path) and renameStoryFolderIfExists (createIfMissing: false, used by the
 * best-effort edit-action triggers): finds the story's Drive folder,
 * renaming it in place when the title-implied name has changed, and
 * optionally creating one when none exists yet. Returns null only when
 * `createIfMissing` is false and no folder exists -- never throws for that
 * case, since "nothing to rename" is a completely normal outcome for a
 * story whose photos (if any) are still all on Supabase.
 *
 * Race note: two concurrent first-uploads for the same brand-new story could
 * both decide "no folder yet" and each create one in Drive before either
 * records it -- upsert_story_drive_folder's ON CONFLICT then keeps exactly
 * one row, but the LOSING call's freshly-created Drive folder is left
 * orphaned (empty, never referenced). This is the same kind of honest,
 * narrow race the design doc already accepts elsewhere (e.g. the Drive
 * session URI window) rather than solving with a distributed lock -- an
 * orphaned empty folder is harmless clutter, not a correctness or privacy
 * problem, and is rare (it needs two uploads to the same never-yet-folder'd
 * story within the same round trip).
 */
async function resolveStoryFolder(
  supabase: SupabaseClient,
  accessToken: string,
  userId: string,
  storyId: string,
  options: { createIfMissing: boolean },
): Promise<string | null> {
  const { data: existingRows, error: getError } = await supabase.rpc(
    "get_story_drive_folder",
    { p_story_id: storyId },
  );
  if (getError) {
    throw new Error(
      `Failed to read Drive folder for story ${storyId}: ${getError.message}`,
    );
  }
  const existing = existingRows?.[0] ?? null;

  if (!existing && !options.createIfMissing) {
    return null;
  }

  const title = await fetchStoryTitle(supabase, storyId);
  const desiredBaseName = sanitizeStoryFolderName(title);

  const { data: nameRows, error: namesError } = await supabase.rpc(
    "list_my_story_drive_folder_names",
    { p_exclude_story_id: storyId },
  );
  if (namesError) {
    throw new Error(`Failed to list Drive folder names: ${namesError.message}`);
  }
  const takenNames = (nameRows ?? []).map(
    (r: { folder_name: string }) => r.folder_name,
  );
  const uniqueName = uniqueFolderName(desiredBaseName, takenNames);

  if (!existing) {
    const { appFolderId } = await ensureAppFolders(userId, accessToken);
    const folderId = await createFolder(
      accessToken,
      uniqueName,
      appFolderId,
      userId,
    );
    const { error: upsertError } = await supabase.rpc(
      "upsert_story_drive_folder",
      {
        p_story_id: storyId,
        p_drive_folder_id: folderId,
        p_folder_name: uniqueName,
      },
    );
    if (upsertError) {
      throw new Error(
        `Failed to record Drive folder for story ${storyId}: ${upsertError.message}`,
      );
    }
    return folderId;
  }

  if (existing.folder_name !== uniqueName) {
    await renameFile(accessToken, existing.drive_folder_id, uniqueName, userId);
    const { error: upsertError } = await supabase.rpc(
      "upsert_story_drive_folder",
      {
        p_story_id: storyId,
        p_drive_folder_id: existing.drive_folder_id,
        p_folder_name: uniqueName,
      },
    );
    if (upsertError) {
      throw new Error(
        `Failed to record renamed Drive folder for story ${storyId}: ${upsertError.message}`,
      );
    }
  }

  return existing.drive_folder_id;
}

/**
 * Finds (or creates) this story's Drive folder, inside the contributor's
 * "Kakinotes" app folder, keeping its name in sync with the story's current
 * title. THROWS on failure -- unlike syncStoryFolder/renameStoryFolderIfExists
 * below, this is called directly on the upload path
 * (lib/story/drive-sync.ts), where a Drive problem must fail the upload
 * itself, not be silently swallowed.
 */
export async function ensureStoryFolder(
  supabase: SupabaseClient,
  accessToken: string,
  userId: string,
  storyId: string,
): Promise<string> {
  const folderId = await resolveStoryFolder(
    supabase,
    accessToken,
    userId,
    storyId,
    { createIfMissing: true },
  );
  // createIfMissing: true always returns a real id or throws -- this is
  // unreachable, just satisfying the shared helper's nullable return type.
  if (!folderId) {
    throw new Error(`Failed to resolve a Drive folder for story ${storyId}`);
  }
  return folderId;
}

/**
 * The title-save trigger's own best-effort action (app/(contributor)/
 * stories/[id]/edit/actions.ts#saveRevisionFieldsAction, via next/server's
 * after()): renames the story's Drive folder ONLY IF one already exists --
 * never creates one. A title save is not an upload; a story with no photos
 * on Drive yet should never spontaneously get a Drive folder just because
 * its title changed. NEVER throws -- same best-effort contract as
 * syncStoryFolder. The caller is expected to have already checked
 * get_story_drive_sync_state()'s has_folder flag before calling this (so a
 * plain supabase-only story never reaches this function at all), but this
 * function re-checks for a folder's existence itself regardless (via
 * resolveStoryFolder's own get_story_drive_folder read) rather than trusting
 * that pre-check blindly.
 */
export async function renameStoryFolderIfExists(
  userId: string,
  storyId: string,
): Promise<void> {
  try {
    const supabase = await createClient();
    const accessToken = await getAccessToken(userId);
    await resolveStoryFolder(supabase, accessToken, userId, storyId, {
      createIfMissing: false,
    });
  } catch (err) {
    console.error(
      "Drive folder rename (title-save, best-effort) failed, no action taken",
      { userId, storyId, error: err instanceof Error ? err.message : err },
    );
  }
}

export type DriveSyncGate = { hasDriveMedia: boolean; hasFolder: boolean };

/**
 * The one cheap, owner-checked, post-response lookup every edit-action
 * trigger calls inside next/server's after() to decide whether a Drive
 * sync/rename is worth attempting at all -- supabase/migrations/20261007190006_
 * story_drive_folders.sql#get_story_drive_sync_state(). Deliberately never
 * throws: any error (including "not the owner", which should not happen for
 * a caller acting on their own story, but is not this function's job to
 * police) is swallowed and reported as null -- "nothing to do" -- since this
 * only ever runs after the response has already been sent, where there is no
 * one left to usefully show an error to.
 */
export async function getDriveSyncGate(
  storyId: string,
): Promise<DriveSyncGate | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_story_drive_sync_state", {
      p_story_id: storyId,
    });
    if (error || !data || data.length === 0) return null;
    const row = data[0];
    return {
      hasDriveMedia: row.has_drive_media ?? false,
      hasFolder: row.has_folder ?? false,
    };
  } catch (err) {
    console.error("Drive sync gate lookup failed (best-effort, skipping)", {
      storyId,
      error: err instanceof Error ? err.message : err,
    });
    return null;
  }
}

type DriveSyncMediaRow = {
  media_id: string;
  drive_processed_file_id: string;
  processed_mime_type: string | null;
  sort_order: number;
};

/**
 * Runs `fn` over `items` with at most `limit` in flight at once, preserving
 * nothing about call ORDER (callers that need pass 1 fully finished before
 * pass 2 starts call this once per pass, not once overall) — just bounds
 * concurrency so a 12-photo story doesn't fire 12 simultaneous Drive calls.
 */
async function withConcurrency<T>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let index = 0;
  async function worker(): Promise<void> {
    while (index < items.length) {
      const item = items[index];
      index += 1;
      await fn(item);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
}

const SYNC_CONCURRENCY = 4;

/**
 * Renumbers a story's Drive-backed photos to 01.ext, 02.ext, ... (matching
 * their current display order) and moves any loose file into the story's
 * folder.
 *
 * ONE Drive files.list call (listFolderChildren) resolves every target
 * file's current name/parents at once, instead of one getFileMetadata()
 * round trip per photo — this is what keeps sync time from growing with
 * story size. Only a target NOT found in that listing (not currently a
 * child of the story folder — e.g. a legacy loose file still sitting in
 * the bare app folder) falls back to an individual getFileMetadata() call,
 * which should be rare after the first sync.
 *
 * Two passes, exactly so numbers never collide mid-way even though Drive
 * itself tolerates duplicate names within a folder: pass 1 gives every file
 * that needs a NEW name a temporary, guaranteed-unique one (moving it into
 * the story folder in the same call, when it also needs moving); pass 2
 * assigns the real NN.ext names. A pure move with no rename needed happens
 * directly, in neither pass, since it has no naming collision risk at all.
 * Only files that actually need a change make any Drive call, and each
 * pass runs with bounded concurrency (SYNC_CONCURRENCY) rather than fully
 * serially or fully in parallel.
 */
async function renumberStoryMedia(
  accessToken: string,
  folderId: string,
  media: readonly DriveSyncMediaRow[],
  userId?: string,
): Promise<void> {
  const targets = media.map((m, index) => ({
    mediaId: m.media_id,
    fileId: m.drive_processed_file_id,
    targetName: `${String(index + 1).padStart(2, "0")}.${extensionForMimeType(m.processed_mime_type)}`,
  }));

  const metadataByFileId = new Map<
    string,
    { name: string; parents: string[] }
  >();

  try {
    const children = await listFolderChildren(accessToken, folderId, userId);
    for (const child of children) {
      metadataByFileId.set(child.id, {
        name: child.name,
        parents: child.parents,
      });
    }
  } catch (err) {
    console.error("Drive sync: could not list story folder contents", {
      folderId,
      error: err instanceof Error ? err.message : err,
    });
  }

  // Fall back to an individual lookup only for a target the folder listing
  // didn't already account for (not currently a child of this folder).
  const missing = targets.filter((t) => !metadataByFileId.has(t.fileId));
  await withConcurrency(missing, SYNC_CONCURRENCY, async (t) => {
    try {
      const meta = await getFileMetadata(accessToken, t.fileId, userId);
      metadataByFileId.set(t.fileId, {
        name: meta.name,
        parents: meta.parents,
      });
    } catch (err) {
      console.error("Drive sync: could not read file metadata, skipping", {
        fileId: t.fileId,
        error: err instanceof Error ? err.message : err,
      });
    }
  });

  type Pending = {
    fileId: string;
    mediaId: string;
    targetName: string;
    oldParentId: string | null;
    needsRename: boolean;
    needsMove: boolean;
  };
  const pending: Pending[] = [];
  for (const t of targets) {
    const meta = metadataByFileId.get(t.fileId);
    if (!meta) continue; // metadata fetch failed above -- already logged
    const oldParentId = meta.parents[0] ?? null;
    const needsMove = !meta.parents.includes(folderId);
    const needsRename = meta.name !== t.targetName;
    if (!needsMove && !needsRename) continue; // already correct -- zero calls
    pending.push({
      fileId: t.fileId,
      mediaId: t.mediaId,
      targetName: t.targetName,
      oldParentId,
      needsRename,
      needsMove,
    });
  }

  // Pass 1: temp-rename (and move, where also needed) everything that needs
  // a new name. Pure moves with no rename run here directly -- they can't
  // collide with anything. Bounded concurrency, but fully finished before
  // pass 2 starts.
  await withConcurrency(pending, SYNC_CONCURRENCY, async (p) => {
    try {
      if (p.needsRename) {
        const tempName = `__sync-${p.mediaId}`;
        if (p.needsMove && p.oldParentId) {
          await renameAndMoveFile(
            accessToken,
            p.fileId,
            tempName,
            folderId,
            p.oldParentId,
            userId,
          );
        } else {
          await renameFile(accessToken, p.fileId, tempName, userId);
        }
      } else if (p.needsMove && p.oldParentId) {
        await moveFile(accessToken, p.fileId, folderId, p.oldParentId, userId);
      }
    } catch (err) {
      console.error(
        "Drive sync: pass 1 (temp-rename/move) failed, skipping file",
        {
          fileId: p.fileId,
          error: err instanceof Error ? err.message : err,
        },
      );
    }
  });

  // Pass 2: assign the real NN.ext names, now that no two files share a
  // name mid-transition.
  const needingFinalRename = pending.filter((p) => p.needsRename);
  await withConcurrency(needingFinalRename, SYNC_CONCURRENCY, async (p) => {
    try {
      await renameFile(accessToken, p.fileId, p.targetName, userId);
    } catch (err) {
      console.error("Drive sync: pass 2 (final rename) failed, skipping file", {
        fileId: p.fileId,
        error: err instanceof Error ? err.message : err,
      });
    }
  });
}

/**
 * Best-effort: ensures the story's folder exists/is named correctly, then
 * renumbers its Drive media. NEVER throws -- every trigger point (upload
 * finalize, reorder, cover change, detach, title save) calls this
 * fire-and-forget (via next/server's `after()` for the title-save/edit
 * actions), and a Drive hiccup must never fail the user's actual action. A
 * later call (the next edit, or the backfill script) fixes any drift this
 * run couldn't complete.
 */
export async function syncStoryFolder(
  userId: string,
  storyId: string,
): Promise<void> {
  try {
    const supabase = await createClient();
    const accessToken = await getAccessToken(userId);
    const folderId = await ensureStoryFolder(
      supabase,
      accessToken,
      userId,
      storyId,
    );

    const { data: mediaRows, error } = await supabase.rpc(
      "list_story_drive_media_for_sync",
      { p_story_id: storyId },
    );
    if (error) {
      throw new Error(
        `Failed to list Drive media for story ${storyId}: ${error.message}`,
      );
    }
    await renumberStoryMedia(accessToken, folderId, mediaRows ?? [], userId);
  } catch (err) {
    console.error("Drive folder sync failed (best-effort, no action taken)", {
      userId,
      storyId,
      error: err instanceof Error ? err.message : err,
    });
  }
}
