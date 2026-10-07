#!/usr/bin/env node
// One-off backfill: moves every already-uploaded Drive photo into its
// story's own named folder (and gives each one its 01.jpg/02.jpg/...
// number), for every self-submitted story that has Drive-backed media
// today. New uploads get this automatically via lib/story/drive-sync.ts's
// finalizeDriveMediaUpload -> syncStoryFolder call; this script exists only
// to catch up anything uploaded before that wiring landed.
//
// Dry run by default -- prints the plan, writes nothing to Drive or the
// database. Pass --apply to actually move/rename files and write
// story_drive_folders rows.
//
//   node --env-file=.env.local scripts/drive-backfill-story-folders.mjs
//   node --env-file=.env.local scripts/drive-backfill-story-folders.mjs --apply
//
// HOW IT GETS EACH OWNER'S TOKEN WITHOUT BREAKING THE IMPORT RULES
// ------------------------------------------------------------------
// lib/drive/token-store.ts is the only TypeScript module allowed to decrypt
// a refresh token or read contributor_drive_connections -- enforced by
// eslint's no-restricted-imports and by that table's RLS (deny-all to
// anon/authenticated; only service_role, which bypasses RLS entirely, can
// read it at all). Both of those restrictions are about the APP's own
// TypeScript module graph and its RLS-respecting runtime clients. This
// script is neither: it is a standalone Node script, outside the Next.js
// build, that talks to Postgres (via PostgREST) and Google's REST APIs
// directly using the service-role key -- the exact same shape
// scripts/reprocess-failed-story-media.mjs already uses for its own
// privileged, one-off repair. Decrypting a refresh token here means
// duplicating token-store.ts's AES-256-GCM scheme in plain JS (below), not
// importing the restricted module -- deliberate duplication, same
// reasoning and the same "keep the two in step" caveat
// reprocess-failed-story-media.mjs already carries for image-pipeline.ts.
// If this script's crypto or Drive-call logic ever drifts from
// lib/drive/token-store.ts / lib/drive/drive-client.ts / lib/story/
// drive-folders.ts, this script is the one that's stale.
//
// Why direct table reads/writes instead of the SECURITY DEFINER RPCs
// (get_story_drive_folder, upsert_story_drive_folder, etc.): every one of
// those RPCs re-derives auth.uid() to check "is the caller actually this
// story's owner". Called over PostgREST with the service-role key (no user
// JWT), auth.uid() is NULL, so every one of those ownership checks would
// fail closed -- they are not reachable from a service-role script at all.
// service_role bypasses RLS and table grants entirely, so this script reads
// and writes the underlying tables directly instead; it is the one piece
// of code in this repo that legitimately needs to.

import { createDecipheriv } from "node:crypto";

const APPLY = process.argv.includes("--apply");
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET;
const TOKEN_ENCRYPTION_KEY = process.env.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY;

if (
  !SUPABASE_URL ||
  !SERVICE_KEY ||
  !GOOGLE_CLIENT_ID ||
  !GOOGLE_CLIENT_SECRET ||
  !TOKEN_ENCRYPTION_KEY
) {
  console.error(
    "Missing one of NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / " +
      "GOOGLE_DRIVE_OAUTH_CLIENT_ID / GOOGLE_DRIVE_OAUTH_CLIENT_SECRET / " +
      "GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY.\n" +
      "Run with: node --env-file=.env.local scripts/drive-backfill-story-folders.mjs",
  );
  process.exit(1);
}

// --------------------------------------------------------------------------
// PostgREST (service role -- bypasses RLS and table grants entirely)
// --------------------------------------------------------------------------

async function restGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
  });
  if (!res.ok) throw new Error(`GET ${path} failed: ${await res.text()}`);
  return res.json();
}

async function restUpsert(table, row) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?on_conflict=story_id`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify(row),
    },
  );
  if (!res.ok) throw new Error(`upsert ${table} failed: ${await res.text()}`);
}

// --------------------------------------------------------------------------
// Token decryption -- duplicates lib/drive/token-store.ts's AES-256-GCM
// scheme exactly (same algorithm, same IV/auth-tag-in-separate-columns
// layout). See this file's header for why this is a deliberate duplicate,
// not an import.
// --------------------------------------------------------------------------

function decryptRefreshToken({ ciphertext, iv, authTag }) {
  const key = Buffer.from(TOKEN_ENCRYPTION_KEY, "base64");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(authTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

async function getAccessToken(refreshToken) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    throw new Error(`Drive token refresh failed (${res.status})`);
  }
  const json = await res.json();
  if (!json.access_token)
    throw new Error("Drive token refresh returned no access_token");
  return json.access_token;
}

// --------------------------------------------------------------------------
// Drive REST calls -- the minimal subset lib/drive/drive-client.ts exports,
// duplicated here for the same "standalone script, not a TS import" reason.
// --------------------------------------------------------------------------

const DRIVE_FILES = "https://www.googleapis.com/drive/v3/files";

async function driveFetch(accessToken, url, init) {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`Drive call failed (${res.status}): ${await res.text()}`);
  }
  return res;
}

async function findFolder(accessToken, name, parentId) {
  const parentClause = parentId
    ? `and '${parentId}' in parents`
    : "and 'root' in parents";
  const q = `mimeType = 'application/vnd.google-apps.folder' and name = '${name}' and trashed = false ${parentClause}`;
  const url = `${DRIVE_FILES}?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive`;
  const json = await (await driveFetch(accessToken, url)).json();
  return json.files?.[0]?.id ?? null;
}

async function createFolder(accessToken, name, parentId) {
  const res = await driveFetch(accessToken, `${DRIVE_FILES}?fields=id`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: parentId ? [parentId] : undefined,
    }),
  });
  return (await res.json()).id;
}

async function findOrCreateFolder(accessToken, name, parentId) {
  return (
    (await findFolder(accessToken, name, parentId)) ??
    (await createFolder(accessToken, name, parentId))
  );
}

async function getFileMetadata(accessToken, fileId) {
  const url = `${DRIVE_FILES}/${encodeURIComponent(fileId)}?fields=id,name,parents`;
  const json = await (await driveFetch(accessToken, url)).json();
  return { id: json.id, name: json.name, parents: json.parents ?? [] };
}

async function renameFile(accessToken, fileId, name) {
  await driveFetch(
    accessToken,
    `${DRIVE_FILES}/${encodeURIComponent(fileId)}?fields=id`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    },
  );
}

async function renameAndMoveFile(
  accessToken,
  fileId,
  name,
  newParentId,
  oldParentId,
) {
  const params = new URLSearchParams({
    addParents: newParentId,
    removeParents: oldParentId,
    fields: "id",
  });
  await driveFetch(
    accessToken,
    `${DRIVE_FILES}/${encodeURIComponent(fileId)}?${params}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    },
  );
}

async function moveFile(accessToken, fileId, newParentId, oldParentId) {
  const params = new URLSearchParams({
    addParents: newParentId,
    removeParents: oldParentId,
    fields: "id",
  });
  await driveFetch(
    accessToken,
    `${DRIVE_FILES}/${encodeURIComponent(fileId)}?${params}`,
    { method: "PATCH" },
  );
}

// --------------------------------------------------------------------------
// Pure naming logic -- duplicates lib/story/drive-folders.ts exactly. Keep
// these two in step; a divergence here means this script can compute a
// different folder/file name than the app would for the same story.
// --------------------------------------------------------------------------

const FORBIDDEN_CHARS = /[/\\:*?"<>|]/g;

function sanitizeStoryFolderName(title) {
  const stripped = (title ?? "").replace(FORBIDDEN_CHARS, " ");
  const collapsed = stripped.trim().replace(/\s+/g, " ");
  const truncated = collapsed.slice(0, 100).trim();
  return truncated.length > 0 ? truncated : "Untitled story";
}

function uniqueFolderName(baseName, takenNames) {
  const taken = new Set(takenNames);
  if (!taken.has(baseName)) return baseName;
  let n = 2;
  while (taken.has(`${baseName} (${n})`)) n += 1;
  return `${baseName} (${n})`;
}

function extensionForMimeType(mimeType) {
  return mimeType === "image/png" ? "png" : "jpg";
}

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------

async function run() {
  const driveMediaRows = await restGet(
    "story_media?select=story_id&storage_backend=eq.google_drive&drive_processed_file_id=not.is.null&processing_state=in.(processed,promotion_pending,promoted)",
  );
  const storyIds = [...new Set(driveMediaRows.map((r) => r.story_id))];
  console.log(
    `${storyIds.length} story(ies) with Drive-backed media${APPLY ? "" : " (DRY RUN -- pass --apply to write)"}\n`,
  );

  const storiesByOwner = new Map();
  for (const storyId of storyIds) {
    const [story] = await restGet(
      `stories?id=eq.${storyId}&select=id,owner_user_id,source_kind,current_draft_revision_id,published_revision_id`,
    );
    if (
      !story ||
      story.source_kind !== "self_submitted" ||
      !story.owner_user_id
    ) {
      console.log(
        `  ${storyId}  SKIP (not a self-submitted, owned story -- Drive mode is owner-only)`,
      );
      continue;
    }
    const revisionId =
      story.current_draft_revision_id ?? story.published_revision_id;
    if (!revisionId) {
      console.log(
        `  ${storyId}  SKIP (no revision to read a title or media order from)`,
      );
      continue;
    }
    const list = storiesByOwner.get(story.owner_user_id) ?? [];
    list.push({ storyId, revisionId });
    storiesByOwner.set(story.owner_user_id, list);
  }

  let ok = 0;
  let failed = 0;

  for (const [ownerUserId, stories] of storiesByOwner) {
    let accessToken;
    let appFolderId;
    try {
      const [connection] = await restGet(
        `contributor_drive_connections?user_id=eq.${ownerUserId}&select=encrypted_refresh_token,token_iv,token_auth_tag,status,drive_folder_id`,
      );
      if (!connection || connection.status !== "active") {
        console.log(
          `  owner ${ownerUserId}  SKIP (no active Drive connection)`,
        );
        failed += stories.length;
        continue;
      }
      const refreshToken = decryptRefreshToken({
        ciphertext: connection.encrypted_refresh_token,
        iv: connection.token_iv,
        authTag: connection.token_auth_tag,
      });
      accessToken = await getAccessToken(refreshToken);
      appFolderId =
        connection.drive_folder_id ??
        (await findOrCreateFolder(accessToken, "Kakinotes", null));
    } catch (err) {
      console.error(
        `  owner ${ownerUserId}  FAILED to get a Drive token: ${err.message}`,
      );
      failed += stories.length;
      continue;
    }

    for (const { storyId, revisionId } of stories) {
      try {
        const [revision] = await restGet(
          `story_revisions?id=eq.${revisionId}&select=title`,
        );
        const desiredBaseName = sanitizeStoryFolderName(revision?.title);

        const [existing] = await restGet(
          `story_drive_folders?story_id=eq.${storyId}&select=drive_folder_id,folder_name`,
        );
        const siblings = await restGet(
          `story_drive_folders?owner_user_id=eq.${ownerUserId}&story_id=neq.${storyId}&select=folder_name`,
        );
        const uniqueName = uniqueFolderName(
          desiredBaseName,
          siblings.map((s) => s.folder_name),
        );

        let folderId;
        if (!existing) {
          folderId = APPLY
            ? await createFolder(accessToken, uniqueName, appFolderId)
            : "(dry-run-new-folder)";
          console.log(`  ${storyId}  create folder "${uniqueName}"`);
        } else {
          folderId = existing.drive_folder_id;
          if (existing.folder_name !== uniqueName) {
            console.log(
              `  ${storyId}  rename folder "${existing.folder_name}" -> "${uniqueName}"`,
            );
            if (APPLY) await renameFile(accessToken, folderId, uniqueName);
          }
        }
        if (APPLY) {
          await restUpsert("story_drive_folders", {
            story_id: storyId,
            owner_user_id: ownerUserId,
            drive_folder_id: folderId,
            folder_name: uniqueName,
          });
        }

        const revMedia = await restGet(
          `story_revision_media?revision_id=eq.${revisionId}&select=media_id,sort_order&order=sort_order.asc`,
        );
        const targets = [];
        for (const rm of revMedia) {
          const [media] = await restGet(
            `story_media?id=eq.${rm.media_id}&select=drive_processed_file_id,processed_mime_type,storage_backend`,
          );
          if (
            media?.storage_backend === "google_drive" &&
            media.drive_processed_file_id
          ) {
            targets.push({
              mediaId: rm.media_id,
              fileId: media.drive_processed_file_id,
              mimeType: media.processed_mime_type,
            });
          }
        }

        const pending = [];
        for (const [index, t] of targets.entries()) {
          const targetName = `${String(index + 1).padStart(2, "0")}.${extensionForMimeType(t.mimeType)}`;
          if (!APPLY && !existing) {
            // Dry run against a not-yet-created folder: we don't have a
            // real folder id to compare parents against, so just report
            // the intended final name.
            console.log(`    ${t.fileId} -> ${targetName} (into new folder)`);
            continue;
          }
          const meta = await getFileMetadata(accessToken, t.fileId);
          const oldParentId = meta.parents[0] ?? null;
          const needsMove = !meta.parents.includes(folderId);
          const needsRename = meta.name !== targetName;
          if (!needsMove && !needsRename) continue;
          pending.push({
            ...t,
            targetName,
            oldParentId,
            needsMove,
            needsRename,
          });
          console.log(
            `    ${t.fileId}  ${meta.name} -> ${targetName}${needsMove ? " (move)" : ""}`,
          );
        }

        if (APPLY) {
          for (const p of pending) {
            if (p.needsRename) {
              const tempName = `__sync-${p.mediaId}`;
              if (p.needsMove && p.oldParentId) {
                await renameAndMoveFile(
                  accessToken,
                  p.fileId,
                  tempName,
                  folderId,
                  p.oldParentId,
                );
              } else {
                await renameFile(accessToken, p.fileId, tempName);
              }
            } else if (p.needsMove && p.oldParentId) {
              await moveFile(accessToken, p.fileId, folderId, p.oldParentId);
            }
          }
          for (const p of pending) {
            if (p.needsRename)
              await renameFile(accessToken, p.fileId, p.targetName);
          }
        }

        ok++;
      } catch (err) {
        console.error(`  ${storyId}  FAILED: ${err.message}`);
        failed++;
      }
    }
  }

  console.log(`\ndone: ${ok} story(ies) processed, ${failed} failed/skipped`);
  process.exit(failed > 0 ? 1 : 0);
}

await run();
