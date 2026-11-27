#!/usr/bin/env node
// One-off backfill: gives every already-uploaded Drive photo its two stored
// card sizes (640 and 1080 wide, 4:3 WebP) -- docs/photo-card-sizes-plan.md,
// Option B. New uploads get them automatically from lib/story/drive-sync.ts;
// this script only catches up photos uploaded before that landed. Until a
// photo has them, the /media proxy resizes on demand, as it always did.
//
// Dry run by default -- prints which photos are missing a size and writes
// nothing to Drive or the database. Pass --apply to write.
//
//   node --env-file=.env.local scripts/drive-backfill-card-sizes.mjs
//   node --env-file=.env.local scripts/drive-backfill-card-sizes.mjs --apply
//
// IT WRITES TO CONTRIBUTORS' GOOGLE DRIVES. Run it on the Mac, with the
// service-role key, only on the owner's say-so, and only after migration
// 20261127091319_story_media_card_sizes.sql has been applied. Never import it
// from app code and never run it on Vercel.
//
// Like drive-backfill-story-folders.mjs (read its header for why): this is a
// standalone Node script, outside the Next.js build, that decrypts the
// owner's refresh token itself (duplicating lib/drive/token-store.ts's
// AES-256-GCM scheme), talks to Drive's REST API directly, and writes the
// table directly with the service-role key, because the SECURITY DEFINER
// functions all check auth.uid(), which is null for a service-role call. The
// duplicated pieces (token decryption, Drive calls, and the resize settings
// below) must be kept in step with lib/drive/*, lib/story/card-photo-resize.ts
// and lib/story/card-photo-size.ts; if they drift, this script is the stale one.
//
// Rule 14: every size is made from the photo's already EXIF-stripped
// display derivative (drive_processed_file_id), never from anything else.
// A row records the display file it was made from, so one made from a file
// that has since been replaced is never served.

import { createDecipheriv, createHash } from "node:crypto";
import sharp from "sharp";

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
      "Run with: node --env-file=.env.local scripts/drive-backfill-card-sizes.mjs",
  );
  process.exit(1);
}

// Keep in step with lib/story/card-photo-size.ts and card-photo-resize.ts.
const CARD_PHOTO_WIDTHS = [640, 1080];
const CARD_PHOTO_ASPECT = 3 / 4;
const CARD_SIZES_FOLDER_NAME = "Card sizes";

function resizeForCard(bytes, width) {
  return sharp(bytes)
    .resize({
      width,
      height: Math.round(width * CARD_PHOTO_ASPECT),
      fit: "cover",
      position: "centre",
      withoutEnlargement: true,
    })
    .webp({ quality: 72 })
    .toBuffer();
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

async function restUpsertCardSize(row) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/story_media_card_sizes?on_conflict=media_id,width`,
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
  if (!res.ok) throw new Error(`upsert card size failed: ${await res.text()}`);
}

// --------------------------------------------------------------------------
// Token decryption -- duplicates lib/drive/token-store.ts
// --------------------------------------------------------------------------

function decryptRefreshToken({ ciphertext, iv, authTag }) {
  const key = Buffer.from(TOKEN_ENCRYPTION_KEY, "base64");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
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
  if (!res.ok) throw new Error(`Drive token refresh failed (${res.status})`);
  const json = await res.json();
  if (!json.access_token) throw new Error("Drive token refresh had no token");
  return json.access_token;
}

// --------------------------------------------------------------------------
// Drive REST calls -- the subset of lib/drive/drive-client.ts this needs
// --------------------------------------------------------------------------

const DRIVE_FILES = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";

async function driveFetch(accessToken, url, init) {
  // `accessToken` is { value, refresh }: Google access tokens last an hour
  // and a full run takes longer, so a 401 gets one fresh token and a retry.
  const send = () =>
    fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken.value}`,
        ...(init?.headers ?? {}),
      },
    });
  let res = await send();
  if (res.status === 401) {
    await res.body?.cancel();
    accessToken.value = await accessToken.refresh();
    res = await send();
  }
  if (!res.ok) {
    throw new Error(`Drive call failed (${res.status}): ${await res.text()}`);
  }
  return res;
}

async function downloadFileBytes(accessToken, fileId) {
  const res = await driveFetch(
    accessToken,
    `${DRIVE_FILES}/${encodeURIComponent(fileId)}?alt=media`,
  );
  return Buffer.from(await res.arrayBuffer());
}

async function findFolder(accessToken, name, parentId) {
  const q = `mimeType = 'application/vnd.google-apps.folder' and name = '${name}' and trashed = false and '${parentId}' in parents`;
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
      parents: [parentId],
    }),
  });
  return (await res.json()).id;
}

async function uploadFile(accessToken, folderId, name, bytes, mimeType) {
  const boundary = `kakinotes-${Date.now().toString(36)}`;
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: [folderId] })}\r\n` +
        `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
      "utf8",
    ),
    bytes,
    Buffer.from(`\r\n--${boundary}--`, "utf8"),
  ]);
  const res = await driveFetch(
    accessToken,
    `${DRIVE_UPLOAD}?uploadType=multipart&fields=id`,
    {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    },
  );
  return (await res.json()).id;
}

async function deleteFilePermanently(accessToken, fileId) {
  await driveFetch(
    accessToken,
    `${DRIVE_FILES}/${encodeURIComponent(fileId)}`,
    {
      method: "DELETE",
    },
  );
}

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------

async function run() {
  const media = await restGet(
    "story_media?select=id,story_id,drive_processed_file_id&storage_backend=eq.google_drive&drive_processed_file_id=not.is.null&deleted_at=is.null&processing_state=in.(processed,promotion_pending,promoted)&order=created_at.asc",
  );
  const existingRows = await restGet(
    "story_media_card_sizes?select=media_id,width,source_drive_file_id",
  );
  const have = new Set(
    existingRows.map(
      (r) => `${r.media_id}:${r.width}:${r.source_drive_file_id}`,
    ),
  );

  // media id -> widths still missing (a row made from an older display file
  // counts as missing).
  const todo = [];
  for (const m of media) {
    const widths = CARD_PHOTO_WIDTHS.filter(
      (w) => !have.has(`${m.id}:${w}:${m.drive_processed_file_id}`),
    );
    if (widths.length > 0) todo.push({ ...m, widths });
  }
  console.log(
    `${media.length} Drive photo(s), ${todo.length} missing at least one card size${APPLY ? "" : " (DRY RUN -- pass --apply to write)"}\n`,
  );

  // Group by story, then by owner (one Drive token per owner).
  const byStory = new Map();
  for (const t of todo) {
    byStory.set(t.story_id, [...(byStory.get(t.story_id) ?? []), t]);
  }
  const byOwner = new Map();
  for (const [storyId, items] of byStory) {
    const [story] = await restGet(
      `stories?id=eq.${storyId}&select=owner_user_id,source_kind`,
    );
    if (
      !story ||
      story.source_kind !== "self_submitted" ||
      !story.owner_user_id
    ) {
      console.log(`  ${storyId}  SKIP (not a self-submitted, owned story)`);
      continue;
    }
    const [folder] = await restGet(
      `story_drive_folders?story_id=eq.${storyId}&select=drive_folder_id`,
    );
    if (!folder) {
      console.log(
        `  ${storyId}  SKIP (no story folder yet; run drive-backfill-story-folders.mjs first)`,
      );
      continue;
    }
    byOwner.set(story.owner_user_id, [
      ...(byOwner.get(story.owner_user_id) ?? []),
      { storyId, folderId: folder.drive_folder_id, items },
    ]);
  }

  let made = 0;
  let failed = 0;

  for (const [ownerUserId, stories] of byOwner) {
    if (!APPLY) {
      for (const { storyId, items } of stories) {
        for (const it of items) {
          console.log(
            `  ${storyId}  media ${it.id}: would make ${it.widths.join(", ")}`,
          );
        }
      }
      continue;
    }

    let accessToken;
    try {
      const [connection] = await restGet(
        `contributor_drive_connections?user_id=eq.${ownerUserId}&select=encrypted_refresh_token,token_iv,token_auth_tag,status`,
      );
      if (!connection || connection.status !== "active") {
        console.log(
          `  owner ${ownerUserId}  SKIP (no active Drive connection)`,
        );
        continue;
      }
      const refreshToken = decryptRefreshToken({
        ciphertext: connection.encrypted_refresh_token,
        iv: connection.token_iv,
        authTag: connection.token_auth_tag,
      });
      const refresh = () => getAccessToken(refreshToken);
      accessToken = { value: await refresh(), refresh };
    } catch (err) {
      console.error(
        `  owner ${ownerUserId}  FAILED to get a token: ${err.message}`,
      );
      continue;
    }

    for (const { storyId, folderId, items } of stories) {
      let cardFolderId;
      try {
        cardFolderId =
          (await findFolder(accessToken, CARD_SIZES_FOLDER_NAME, folderId)) ??
          (await createFolder(accessToken, CARD_SIZES_FOLDER_NAME, folderId));
      } catch (err) {
        console.error(
          `  ${storyId}  FAILED to get the Card sizes folder: ${err.message}`,
        );
        failed += items.length;
        continue;
      }
      for (const it of items) {
        let source;
        try {
          source = await downloadFileBytes(
            accessToken,
            it.drive_processed_file_id,
          );
        } catch (err) {
          console.error(
            `  ${storyId}  media ${it.id}: FAILED to download: ${err.message}`,
          );
          failed += 1;
          continue;
        }
        for (const width of it.widths) {
          let fileId = null;
          try {
            const bytes = await resizeForCard(source, width);
            fileId = await uploadFile(
              accessToken,
              cardFolderId,
              `${it.id}-${width}.webp`,
              bytes,
              "image/webp",
            );
            await restUpsertCardSize({
              media_id: it.id,
              width,
              drive_file_id: fileId,
              source_drive_file_id: it.drive_processed_file_id,
              sha256: createHash("sha256").update(bytes).digest("hex"),
              file_size_bytes: bytes.byteLength,
              updated_at: new Date().toISOString(),
            });
            made += 1;
            console.log(`  ${storyId}  media ${it.id}: made ${width}`);
          } catch (err) {
            failed += 1;
            console.error(
              `  ${storyId}  media ${it.id} ${width}: FAILED: ${err.message}`,
            );
            // Nothing in the database points at an unrecorded file: remove it.
            if (fileId) {
              await deleteFilePermanently(accessToken, fileId).catch(() => {});
            }
          }
        }
      }
    }
  }

  console.log(
    APPLY
      ? `\nDone: ${made} size(s) made, ${failed} failure(s).`
      : "\nDry run only -- nothing written.",
  );
  if (failed > 0) process.exitCode = 1;
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
