"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { RevisionMediaItem } from "@/lib/story/contributor-queries";
import {
  isStaleVersionConflict,
  type MutationQueue,
} from "@/lib/story/mutation-queue";
import {
  looksLikeHeicUpload,
  MAX_HEIC_UPLOAD_BYTES,
  MAX_IMAGES_PER_REVISION,
  MAX_UPLOAD_BYTES,
  UPLOAD_ACCEPT_ATTRIBUTE,
} from "@/lib/story/image-validation";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/components/ui/toast";
import { Spinner } from "@/components/ui/spinner";
import { LightboxPhoto } from "@/components/ui/photo-lightbox";
import { ResolvingImage } from "@/components/ui/resolving-image";
import { PlusIcon, TrashIcon } from "@/components/icons";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { SortablePhotoTile } from "@/components/story/sortable-photo-tile";
import {
  abortOnResume,
  retryOnNetworkError,
} from "@/lib/story/wait-for-resume";
import { holdScreenAwake } from "@/lib/story/upload-wake-lock";
import { createClient as createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  reorderMediaAction,
  setCoverAction,
  detachMediaAction,
  updateMediaCaptionAction,
} from "@/app/(contributor)/stories/[id]/edit/actions";
import {
  mintPreviewUrlAction,
  refreshMediaAction,
} from "@/app/(contributor)/stories/[id]/media-actions";
import {
  beginMediaUploadAction,
  finalizeMediaUploadAction,
  transcodeHeicUploadAction,
} from "@/app/(contributor)/stories/[id]/edit/upload-actions";
// Drive mode's own actions/upload client are deliberately NOT imported
// statically here, even though every other Server Action this component
// calls is. lib/story/drive-sync.ts (which these transitively import)
// carries `import "server-only"`, and that package throws unconditionally
// the moment it's evaluated OUTSIDE Next's own bundler (confirmed live:
// loading this component under Vitest with a static import crashed the
// whole test file before a single test ran — `server-only`'s guard has no
// special-case for "being imported by a Client Component test"). A
// dynamic import() here defers that evaluation until the mode-check
// effect/Drive branch below actually runs, turning a module-load-time
// crash into an ordinary rejected promise this component already catches
// — see the uploadMode effect and the Drive branch of handleFiles.
type DriveUploadActionsModule =
  typeof import("@/app/(contributor)/stories/[id]/edit/drive-upload-actions");
type DriveUploadClientModule = typeof import("@/lib/story/drive-upload-client");

/** Types a browser can render directly in an <img>, for the in-flight tile. */
const BROWSER_RENDERABLE_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * Client-side pre-check only (the server re-sniffs the real magic bytes).
 */
function isAcceptedFile(file: File): boolean {
  if (BROWSER_RENDERABLE_TYPES.includes(file.type)) return true;
  return looksLikeHeicUpload(file.type, file.name);
}

/**
 * Uploads `file` directly to Supabase Storage using the browser's own
 * session — never through this app's server at all. This is the fix for
 * the platform limit that made HEIC uploads fail unpredictably: Vercel's
 * Node.js Functions synchronously invoke via AWS Lambda underneath, whose
 * request payload is base64-encoded for binary bodies, working out to an
 * effective ~4.5 MiB ceiling on the raw bytes a Function can receive —
 * root-caused live by a 24MP iPhone HEIC (4.1 MB) failing with a 413
 * carrying a non-JSON body (proof the platform rejected it before this
 * app's own code, which always answers with JSON, ever ran) while a 12MP
 * HEIC from the same phone succeeded every time.
 *
 * Authorized by exactly the same storage RLS policy
 * (_can_write_reserved_media_path) that already scoped writes to the
 * caller's own auth.uid() — not "must come from our server" — so this
 * changes where the bytes travel, not the authorization model.
 */
async function uploadDirectlyToStorage(
  reservedPath: string,
  file: File,
  contentType: string,
  accessToken: string,
  // Passed in rather than resolved here: this is a module-scope helper, so
  // it cannot call a translation hook of its own.
  messages: { tooLarge: string; failedWithStatus: (status: number) => string },
  // True on a retry after a network failure: the earlier attempt may have
  // landed before the page froze, and its object then already exists.
  allowExisting = false,
  signal?: AbortSignal,
): Promise<void> {
  const encodedPath = reservedPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/story-images-private/${encodedPath}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      "Content-Type": contentType,
      "x-upsert": "false",
    },
    body: file,
    signal,
  });
  if (response.ok) return;

  // Supabase Storage answers its own errors as JSON
  // ({statusCode, error, message}), unlike the Vercel-platform-level
  // failure this function exists to route around.
  const raw = await response.text().catch(() => "");
  let message: string | undefined;
  let duplicate = response.status === 409;
  try {
    const body = JSON.parse(raw) as {
      message?: string;
      statusCode?: string | number;
      error?: string;
    };
    message = body.message;
    // Older Storage versions answer a duplicate as HTTP 400 carrying
    // statusCode "409" / error "Duplicate" in the body.
    if (String(body.statusCode) === "409" || body.error === "Duplicate")
      duplicate = true;
  } catch {
    // Not JSON — fall through to a status-derived message below.
  }
  // The reserved path is unique to this one media row, so an object already
  // there can only be this same photo from the attempt the freeze cut off.
  // Storage writes an object only once it has every byte, so it is whole.
  if (duplicate && allowExisting) return;
  if (message) throw new Error(message);
  if (response.status === 413) {
    throw new Error(messages.tooLarge);
  }
  throw new Error(messages.failedWithStatus(response.status));
}

type UploadingItem = {
  key: string;
  fileName: string;
  /** "queued": selected, waiting for the photos ahead of it to finish --
   * photos go up strictly one at a time, in the order they were picked. */
  progress: "queued" | "uploading" | "processing";
  /** True while the page is frozen/offline and the upload is waiting to
   * resume on its own (iOS screen lock). Not a failure. */
  paused?: boolean;
  /** Local object URL for the file being uploaded, so the tile can show the
   * actual image (dimmed, with a centered spinner over it) instead of a
   * blank placeholder while the real upload/processing is in flight.
   * Revoked once the item leaves `uploading` (see dropFromQueue).
   * null for a HEIC file: most browsers cannot render one in an <img>, so a
   * plain muted tile beats a broken-image icon. */
  previewUrl: string | null;
};

export type ImageUploadManagerProps = {
  storyId: string;
  revisionId: string;
  initialMedia: RevisionMediaItem[];
  versionRef: React.MutableRefObject<number>;
  queue: MutationQueue;
  onVersionBumped: () => void;
  /**
   * mediaIds already placed inline in the story text (an "image"
   * content_json block referencing them) -- excluded from this panel
   * entirely rather than shown-but-undeletable, so there's no separate
   * "can't remove, it's used in your text" error state to build: removing
   * an image from the text (in the editor) is what returns it here.
   */
  inlineMediaIds: ReadonlySet<string>;
  /**
   * Called when an image is removed, so the open editor can strip that
   * image's `![[mediaId]]` embed tokens from the story text to match.
   * detach_story_media() does the same strip authoritatively in the
   * database (see 20260815100000_detach_media_strips_embed_tokens.sql) --
   * this keeps the editor this panel is sitting next to in step, so the
   * next autosave doesn't try to re-save a reference the revision no
   * longer carries.
   */
  onMediaDetached?: (mediaId: string) => void;
};

const PROCESSING_LABEL_KEYS: Record<string, string> = {
  pending_upload: "uploading",
  uploaded: "preparing",
  processing: "processing",
  processed: "ready",
  failed: "failed",
  promotion_pending: "ready",
  promoted: "ready",
};

type MediaTextPatch = Partial<Pick<RevisionMediaItem, "altText" | "caption">>;

/**
 * Distinguishes one photo from another in an accessible name, so a screen
 * reader hears "Details, photo 3" or "Describe, vines at dusk" rather than
 * a dozen identical "Details" buttons.
 */
function itemName(
  item: RevisionMediaItem,
  index: number,
  fallback: (index: number) => string,
): string {
  const described = item.altText?.trim() || item.caption?.trim();
  // The contributor's own words when they have written any -- never
  // translated -- and our numbered fallback otherwise.
  return described ? `“${described}”` : fallback(index + 1);
}

/** Status pip on a tile -- "Cover", "In story", "Needs description". */
function TileBadge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "warning";
}) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] leading-tight font-medium backdrop-blur-sm ${
        tone === "warning"
          ? "bg-amber-500/90 text-black"
          : "bg-black/70 text-white"
      }`}
    >
      {children}
    </span>
  );
}

/**
 * A secondary action inside the detail panel. A real button with a border,
 * not the underlined text link the old tiles used: five underlined links
 * wrapping across two lines gave "Add to story" and "Remove" identical
 * weight, which is exactly backwards for one safe action and one
 * destructive one.
 */
function TileAction({
  children,
  onClick,
  tone = "neutral",
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: "neutral" | "destructive";
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`rounded-md border px-2.5 py-1.5 text-xs font-medium ${
        tone === "destructive"
          ? "border-destructive/40 text-destructive"
          : "border-border-subtle"
      }`}
    >
      {children}
    </button>
  );
}

export function ImageUploadManager({
  storyId,
  revisionId,
  initialMedia,
  versionRef,
  queue,
  onVersionBumped,
  inlineMediaIds,
  onMediaDetached,
}: ImageUploadManagerProps) {
  const t = useTranslations("editor.photos");
  const tCommon = useTranslations("common");
  const tImages = useTranslations("editor.images");
  const [media, setMedia] = useState<RevisionMediaItem[]>(
    [...initialMedia].sort((a, b) => a.sortOrder - b.sortOrder),
  );
  // Uploaded but not yet placed in the story text.
  const visibleMedia = media.filter((m) => !inlineMediaIds.has(m.mediaId));
  // Already placed in the story text (from an existing embed token in a
  // published story predating this panel's own removal of in-body image
  // placement -- see markdown-editor.tsx). These used to be hidden from this
  // panel entirely, which meant alt text and captions became UNEDITABLE the
  // moment an image was put where it belonged -- the natural order (place
  // the photo, then describe it) was impossible, and it was the reason
  // stories arrived at moderation with the `images_missing_alt_text`
  // warning. They still get their own group below: describe and
  // cover/remove, but no reorder (their order is the order they appear in
  // the text).
  const placedMedia = media.filter((m) => inlineMediaIds.has(m.mediaId));
  const [uploading, setUploading] = useState<UploadingItem[]>([]);
  // Serializes batches: see handleFiles' "Pass 2".
  const uploadChainRef = useRef<Promise<void>>(Promise.resolve());
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [isDragging, setIsDragging] = useState(false);
  // The photo whose tile trash button was tapped, waiting on the confirm
  // dialog. The tile button is one tap from anywhere in the grid, so unlike
  // "Delete photo" inside the opened Details panel it asks first.
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  // The server's own decision (lib/story/drive-sync.ts#getStoryMediaUploadMode),
  // fetched once per revision — this component NEVER decides its own mode.
  // Defaults to "supabase" until the check resolves (and forever, if it
  // fails for any reason): the existing, byte-for-byte-unchanged upload
  // path is the safe default, never Drive.
  const [uploadMode, setUploadMode] = useState<"supabase" | "google_drive">(
    "supabase",
  );
  useEffect(() => {
    let cancelled = false;
    import("@/app/(contributor)/stories/[id]/edit/drive-upload-actions")
      .then((mod) => mod.getStoryMediaUploadModeAction(revisionId))
      .then((mode) => {
        if (!cancelled) setUploadMode(mode);
      })
      .catch(() => {
        if (!cancelled) setUploadMode("supabase");
      });
    return () => {
      cancelled = true;
    };
  }, [revisionId]);
  // Which photo's detail panel is expanded. One at a time, deliberately:
  // the old panel put a checkbox and two text inputs on EVERY tile, so a
  // dozen photos meant three dozen form controls competing for attention
  // and no tile you could actually look at. Every media library worth
  // copying (WordPress attachment details, Substack's edit-image panel,
  // Google Photos' info pane) shows a quiet grid and opens details for the
  // one item you asked about.
  const [openMediaId, setOpenMediaId] = useState<string | null>(null);
  // Media ids whose signed thumbnail URL already failed once and was
  // re-minted. Guards the onError retry below against a loop when the image
  // is genuinely broken rather than merely expired.
  const retriedThumbnailsRef = useRef<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  // Revokes every local preview URL this component ever created (including
  // ones for errored items that never leave `uploading`, since those have
  // no other removal point) once the panel itself unmounts.
  const previewUrlsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const urls = previewUrlsRef.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, []);

  // Mint (or re-mint) a signed thumbnail URL for every processed image not
  // already showing one. Signed URLs expire after 120 seconds
  // (lib/story/image-pipeline.ts) — a short authoring session doesn't need
  // more than this; a longer-lived session could go stale, a known
  // limitation for this sub-phase (see docs/implementation-status.md).
  useEffect(() => {
    const missing = media.filter(
      (m) =>
        (m.processingState === "processed" ||
          m.processingState === "promotion_pending" ||
          m.processingState === "promoted") &&
        !thumbnails[m.mediaId],
    );
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const item of missing) {
        const result = await mintPreviewUrlAction(item.mediaId);
        if (cancelled) return;
        if ("url" in result) {
          setThumbnails((prev) => ({ ...prev, [item.mediaId]: result.url }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- thumbnails is intentionally read-not-depended-on to avoid an infinite mint loop
  }, [media]);

  /**
   * A thumbnail's signed URL stopped working. These URLs are minted with a
   * 120-second expiry (lib/story/image-pipeline.ts) and the minting effect
   * above deliberately skips any media id already in `thumbnails`, so a URL
   * is never refreshed once obtained. That is invisible while the <img>
   * stays mounted -- the browser keeps showing an image it already decoded
   * -- and becomes visible the moment anything remounts the element, which
   * is exactly what opening a photo's detail panel used to do: a fresh
   * <img> re-requests the dead URL and renders nothing.
   *
   * The remount is fixed separately (the tile and the detail panel now
   * share one element tree, so the <img> survives the toggle). This is the
   * belt-and-braces half: any expiry, from any cause, recovers by minting a
   * new URL once. Same shape as the retry in
   * app/(contributor)/my-stories/story-cover-thumbnail.tsx.
   */
  function retryThumbnail(mediaId: string) {
    if (retriedThumbnailsRef.current.has(mediaId)) return;
    retriedThumbnailsRef.current.add(mediaId);
    void mintPreviewUrlAction(mediaId).then((result) => {
      if ("url" in result) {
        setThumbnails((prev) => ({ ...prev, [mediaId]: result.url }));
        // Allow one more retry after a SUCCESSFUL re-mint: the new URL has
        // its own 120s life and can expire again in a long session.
        retriedThumbnailsRef.current.delete(mediaId);
      }
    });
  }

  // refresh() is fired without waiting during a batch (so the next photo
  // starts straight away), so two can be in flight at once. Only the newest
  // one may write, or an older, slower reply could hide a photo that a later
  // refresh had already shown.
  const refreshSeqRef = useRef(0);
  async function refresh() {
    const seq = ++refreshSeqRef.current;
    const result = await refreshMediaAction(storyId);
    if (seq !== refreshSeqRef.current) return;
    if ("media" in result) {
      setMedia([...result.media].sort((a, b) => a.sortOrder - b.sortOrder));
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const remainingSlots =
      MAX_IMAGES_PER_REVISION - media.length - uploading.length;
    const toUpload = Array.from(files).slice(0, Math.max(0, remainingSlots));
    const batchStamp = Date.now();

    // Pass 1: put EVERY selected photo in the row straight away, so the
    // contributor sees the whole batch at once and can watch it work through
    // one tile at a time -- rather than tiles appearing one by one as each
    // upload happens to start.
    const batch = toUpload.map((file, index) => {
      const key = `${batchStamp}-${index}-${file.name}-${file.size}`;
      const previewUrl = BROWSER_RENDERABLE_TYPES.includes(file.type)
        ? URL.createObjectURL(file)
        : null;
      if (previewUrl) previewUrlsRef.current.add(previewUrl);
      // Fast client-side pre-checks — UX feedback only. Every real safety
      // decision (true format, dimensions, decode success) happens
      // server-side in lib/story/image-pipeline.ts; nothing here is trusted.
      const sizeLimit = looksLikeHeicUpload(file.type, file.name)
        ? MAX_HEIC_UPLOAD_BYTES
        : MAX_UPLOAD_BYTES;
      const error = !isAcceptedFile(file)
        ? t("errors.unsupportedType")
        : file.size > sizeLimit
          ? `File is too large (max ${Math.floor(sizeLimit / (1024 * 1024))} MB).`
          : undefined;
      return { file, key, previewUrl, error };
    });
    // A photo that fails the pre-checks never joins the queue: it is
    // reported once, in a toast, and that's it.
    for (const { file, previewUrl, error } of batch) {
      if (!error) continue;
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        previewUrlsRef.current.delete(previewUrl);
      }
      showToast(
        t("errors.notAddedToast", { fileName: file.name, reason: error }),
        "error",
      );
    }
    setUploading((prev) => [
      ...prev,
      ...batch
        .filter(({ error }) => !error)
        .map(({ file, key, previewUrl }): UploadingItem => ({
          key,
          fileName: file.name,
          progress: "queued",
          previewUrl,
        })),
    ]);

    // Every photo leaves the queue the moment it is done with -- finished or
    // failed alike. A finished one reappears as a real tile once refresh()
    // lands; a failed one is explained by its toast.
    const dropFromQueue = (key: string, previewUrl: string | null) => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        previewUrlsRef.current.delete(previewUrl);
      }
      setUploading((prev) => prev.filter((u) => u.key !== key));
    };

    // Pass 2: upload the valid ones strictly in order, one at a time. A
    // second pick made while a batch is still going waits for it on
    // uploadChainRef instead of uploading alongside it, so there is only
    // ever one spinner in the row.
    const runBatch = async () => {
      // Keep the screen on until this batch is done, so it never locks
      // mid-upload in the first place (see lib/story/upload-wake-lock.ts).
      const releaseWake = holdScreenAwake();
      try {
        await uploadEach();
      } finally {
        releaseWake();
      }
    };
    const uploadEach = async () => {
      for (const { file, key, previewUrl, error } of batch) {
        if (error) continue;

        setUploading((prev) =>
          prev.map((u) =>
            u.key === key ? { ...u, progress: "uploading" } : u,
          ),
        );

        // Pause/resume on a frozen page (iOS screen lock): while paused the
        // tile says so instead of looking failed. Only a NETWORK rejection
        // is retried -- never a returned { error } or a real server error.
        const setPaused = (paused: boolean) =>
          setUploading((prev) =>
            prev.map((u) => (u.key === key ? { ...u, paused } : u)),
          );
        const retry = <T,>(fn: () => Promise<T>) =>
          retryOnNetworkError(fn, { onPause: setPaused });

        const isHeic = looksLikeHeicUpload(file.type, file.name);
        const sourceMimeType = isHeic
          ? ("image/heic" as const)
          : (file.type as "image/jpeg" | "image/png" | "image/webp");

        try {
          // Drive mode is decided ENTIRELY server-side (uploadMode, fetched
          // on mount) — this branch is the only place that conditional
          // appears in this component; everything below it in the non-Drive
          // branch is the existing code, untouched. See lib/story/drive-
          // upload-client.ts for why the chunked-PUT-to-Drive logic isn't
          // inlined here.
          if (uploadMode === "google_drive") {
            const [driveActions, driveClient]: [
              DriveUploadActionsModule,
              DriveUploadClientModule,
            ] = await Promise.all([
              import("@/app/(contributor)/stories/[id]/edit/drive-upload-actions"),
              import("@/lib/story/drive-upload-client"),
            ]);
            const begunDrive = await driveClient.beginAndUploadToDrive(
              { revisionId, file, mimeType: sourceMimeType },
              driveActions.beginDriveMediaUploadAction,
              undefined,
              setPaused,
            );

            setUploading((prev) =>
              prev.map((u) =>
                u.key === key ? { ...u, progress: "processing" } : u,
              ),
            );

            // Same shared-queue reasoning as the Supabase path below: the
            // version is only ever read inside this serialized callback, so
            // the next autosave reads the version THIS upload produced
            // instead of racing it.
            const finalizedDrive = await new Promise<
              Awaited<
                ReturnType<
                  DriveUploadActionsModule["finalizeDriveMediaUploadAction"]
                >
              >
            >((resolve) => {
              queue.enqueue(
                `media-finalize:${begunDrive.mediaId}`,
                async () => {
                  // Retried on a network rejection only: the finalize RPC is
                  // idempotent once the media has left pending_upload (its
                  // check runs before the stale-version check), so a lost
                  // response cannot double-run it.
                  const result = await retry(() =>
                    driveActions.finalizeDriveMediaUploadAction(
                      begunDrive.mediaId,
                      versionRef.current,
                      begunDrive.driveFileId,
                    ),
                  );
                  if (!("error" in result)) {
                    if (result.version !== null) {
                      versionRef.current = result.version;
                    }
                    onVersionBumped();
                    resolve(result);
                    return;
                  }
                  resolve(result);
                  if (isStaleVersionConflict(result.error)) {
                    throw new Error(result.error);
                  }
                },
              );
            });
            if ("error" in finalizedDrive) {
              throw new Error(finalizedDrive.error);
            }
          } else {
            // Retried on a network rejection only, like the Drive path's
            // begin: a lost reply leaves one orphan reservation that expires.
            const begun = await retry(() =>
              beginMediaUploadAction(revisionId, sourceMimeType),
            );
            if ("error" in begun) throw new Error(begun.error);
            const { mediaId, reservedPath } = begun;

            setUploading((prev) =>
              prev.map((u) =>
                u.key === key ? { ...u, progress: "processing" } : u,
              ),
            );

            // One POST with the whole file. If the screen locks mid-way the
            // request dies (or hangs, see abortOnResume); wait for the page
            // to come back and send it again. The session is read inside
            // the retry so a token refreshed while frozen is picked up.
            let attempt = 0;
            await retry(async () => {
              const isRetry = attempt++ > 0;
              const {
                data: { session },
              } = await createBrowserSupabaseClient().auth.getSession();
              if (!session) throw new Error(tCommon("mustBeSignedIn"));
              const guard = abortOnResume();
              try {
                await uploadDirectlyToStorage(
                  reservedPath,
                  file,
                  sourceMimeType,
                  session.access_token,
                  {
                    tooLarge: t("errors.tooLarge"),
                    failedWithStatus: (status) =>
                      t("errors.uploadFailedStatus", { status }),
                  },
                  isRetry,
                  guard.signal,
                );
              } finally {
                guard.done();
              }
            });

            if (isHeic) {
              const transcoded = await retry(() =>
                transcodeHeicUploadAction(mediaId),
              );
              if ("error" in transcoded) throw new Error(transcoded.error);
            }

            // On the shared mutation queue, exactly like this panel's four other
            // version-bumping mutations below (reorder, cover, detach, caption).
            //
            // It used to be a bare `await` outside the queue, and that was a
            // real data-loss bug: finalize_story_media_upload takes an
            // expectedVersion, and so does the editor's 600ms-debounced autosave.
            // Upload a photo just after typing and the two went out
            // CONCURRENTLY carrying the same version -- whichever landed second
            // was rejected with "Stale version", and when the loser was the text
            // save, the words the contributor had just written were simply never
            // persisted. Queueing it means the version is only ever read inside a
            // serialized callback, so the autosave that runs next reads the
            // version this upload produced instead of racing it.
            const finalized = await new Promise<
              Awaited<ReturnType<typeof finalizeMediaUploadAction>>
            >((resolve) => {
              queue.enqueue(`media-finalize:${mediaId}`, async () => {
                // Idempotent past pending_upload (see the RPC), so a retry
                // after a lost response is a safe no-op.
                const result = await retry(() =>
                  finalizeMediaUploadAction(mediaId, versionRef.current),
                );
                if (!("error" in result)) {
                  // The server's own post-bump version, not an assumed "+1":
                  // finalizeMediaUploadAction retries a stale version against
                  // the live one, so the bump can start from a number this tab
                  // never held. Null means it could not be read — leave the
                  // counter alone rather than guess it wrong.
                  if (result.version !== null)
                    versionRef.current = result.version;
                  onVersionBumped();
                  resolve(result);
                  return;
                }
                resolve(result);
                // Every OTHER mutation on this shared queue throws on failure,
                // which is what lets the queue's own onVersionConflict callback
                // (story-edit-form.tsx) show the "this draft changed elsewhere —
                // reload to continue" banner instead of a plain toast that just
                // invites retrying into the same wall. This one used to swallow
                // its own error and resolve unconditionally, so a genuine
                // version conflict on a photo upload never reached that banner
                // — only a generic "failed to upload" toast, with nothing
                // telling the contributor their local version was stale. Rethrow
                // for a version conflict specifically (not every finalize
                // failure — an unsupported format or a decode failure is not
                // "reload this page", it's "pick a different photo").
                if (isStaleVersionConflict(result.error)) {
                  throw new Error(result.error);
                }
              });
            });
            if ("error" in finalized) throw new Error(finalized.error);
          }
          dropFromQueue(key, previewUrl);
          showToast(t("errors.uploadedToast", { fileName: file.name }));
          // Deliberately AFTER the success toast, and never thrown: by this
          // point the photo is uploaded, finalized and attached. refresh()
          // only re-reads the tile list, so letting it throw in here would
          // have painted a finished upload as a failed one. Not awaited, so
          // the next photo in the queue starts at once.
          void refresh().catch(() => {});
        } catch (error) {
          const message = getErrorMessage(error, t("errors.uploadFailed"));
          dropFromQueue(key, previewUrl);
          showToast(
            t("errors.notAddedToast", { fileName: file.name, reason: message }),
            "error",
          );
        }
      }
    };
    const next = uploadChainRef.current.then(runBatch, runBatch);
    uploadChainRef.current = next;
    await next;
  }

  // Drag and drop (task #4). Mouse: a drag starts after 6px of movement, so
  // a plain click still opens the photo. Touch: a 250ms press-and-hold
  // starts it, so a swipe still scrolls the page. Keyboard: each tile has a
  // "Move" handle button (shown on focus); Space picks the photo up, arrow
  // keys move it through the grid, Space drops, Escape cancels. That keeps a
  // non-drag way to reorder (WCAG 2.5.7) without the old Earlier / Later
  // buttons.
  // A stable id for DndContext: without one dnd-kit numbers its keyboard
  // instructions element from a module counter, which differs between the
  // server render and hydration (aria-describedby mismatch on every handle).
  const dndId = useId();
  const dragSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  // A mouse drag that ends over the same photo still fires a click on it,
  // which would open the lightbox. Swallow exactly that one click.
  const justDraggedRef = useRef(false);
  function markJustDragged() {
    justDraggedRef.current = true;
    setTimeout(() => {
      justDraggedRef.current = false;
    }, 0);
  }

  function handleDragEnd(event: DragEndEvent) {
    markJustDragged();
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = media.findIndex((m) => m.mediaId === active.id);
    const to = media.findIndex((m) => m.mediaId === over.id);
    if (from === -1 || to === -1) return;
    commitOrder(arrayMove(media, from, to));
  }

  const positionOf = (id: string | number) =>
    media.findIndex((m) => m.mediaId === id) + 1;
  const dragAnnouncements: Announcements = {
    onDragStart: ({ active }) =>
      t("drag.pickedUp", { position: positionOf(active.id) }),
    onDragOver: ({ over }) =>
      over
        ? t("drag.over", {
            position: positionOf(over.id),
            total: media.length,
          })
        : undefined,
    onDragEnd: ({ over }) =>
      over
        ? t("drag.dropped", { position: positionOf(over.id) })
        : t("drag.cancelled"),
    onDragCancel: () => t("drag.cancelled"),
  };

  // The one place a new order is applied: optimistic local state, then the
  // same queued, version-checked reorderMediaAction both the buttons and a
  // drag use.
  function commitOrder(next: RevisionMediaItem[]) {
    setMedia(next);
    queue.enqueue("media-reorder", async () => {
      const result = await reorderMediaAction(
        revisionId,
        versionRef.current,
        next.map((m) => m.mediaId),
        storyId,
      );
      if (result.ok) {
        versionRef.current += 1;
        onVersionBumped();
      } else {
        throw new Error(result.error);
      }
    });
  }

  function setCover(mediaId: string) {
    setMedia((prev) =>
      prev.map((m) => ({ ...m, isCover: m.mediaId === mediaId })),
    );
    queue.enqueue("media-cover", async () => {
      const result = await setCoverAction(
        revisionId,
        versionRef.current,
        mediaId,
        storyId,
      );
      if (result.ok) {
        versionRef.current += 1;
        onVersionBumped();
      } else {
        throw new Error(result.error);
      }
    });
  }

  function detach(mediaId: string) {
    setMedia((prev) => prev.filter((m) => m.mediaId !== mediaId));
    onMediaDetached?.(mediaId);
    queue.enqueue(`media-detach:${mediaId}`, async () => {
      const result = await detachMediaAction(
        revisionId,
        versionRef.current,
        mediaId,
        storyId,
      );
      if (result.ok) {
        versionRef.current += 1;
        onVersionBumped();
      } else {
        throw new Error(result.error);
      }
    });
  }

  // One optional caption per photo. The server copies it into alt text too
  // (and marks an empty one decorative) -- see updateMediaCaptionAction --
  // so the local copy mirrors that for the thumbnail's own alt attribute.
  function updateCaption(mediaId: string, caption: string) {
    setMedia((prev) =>
      prev.map((m) =>
        m.mediaId === mediaId ? { ...m, caption, altText: caption } : m,
      ),
    );
    queue.enqueue(`media-caption:${mediaId}`, async () => {
      const result = await updateMediaCaptionAction({
        revisionId,
        mediaId,
        expectedVersion: versionRef.current,
        caption,
      });
      if (result.ok) {
        versionRef.current += 1;
        onVersionBumped();
      } else {
        throw new Error(result.error);
      }
    });
  }

  // The photo whose details sheet is open (null when closed, or once that
  // photo is gone -- a detach elsewhere simply closes the sheet).
  const openIndex = media.findIndex((m) => m.mediaId === openMediaId);
  const openItem = openIndex === -1 ? null : media[openIndex];
  const closeDetails = () => setOpenMediaId(null);

  return (
    <div className="space-y-4">
      <div>
        <label
          htmlFor="story-image-upload"
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setIsDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            void handleFiles(e.dataTransfer.files);
          }}
          className={`flex w-full cursor-pointer items-center justify-center gap-3 rounded-lg border-2 border-dashed px-4 py-4 transition-colors ${
            isDragging
              ? "border-accent bg-accent/5"
              : "border-border-subtle hover:bg-surface-muted"
          }`}
        >
          {/* Compact on purpose: one action and one line of limits. The
              file-type list and the Drive note are gone -- a photo that
              breaks a rule is explained in its own toast when it happens. */}
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent"
          >
            <PlusIcon className="h-5 w-5" />
          </span>
          <span className="flex flex-col">
            <span className="text-sm font-medium">{t("dropzone")}</span>
            <span className="text-xs text-muted-foreground">
              {t("dropzoneLimits", {
                max: MAX_IMAGES_PER_REVISION,
                mb: Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024)),
              })}
            </span>
          </span>
        </label>
        <input
          ref={fileInputRef}
          id="story-image-upload"
          type="file"
          accept={UPLOAD_ACCEPT_ATTRIBUTE}
          multiple
          className="sr-only"
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {(media.length > 0 || uploading.length > 0) && (
        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p className="text-sm font-medium">
              {t("count", { count: media.length })}
              {placedMedia.length > 0 && (
                <span className="font-normal text-muted-foreground">
                  {" "}
                  · {t("placedCount", { count: placedMedia.length })}
                </span>
              )}
            </p>
          </div>

          {media.length > 1 && (
            <p className="mt-1 text-xs text-muted-foreground">
              {t("drag.hint")}
            </p>
          )}

          <DndContext
            id={dndId}
            sensors={dragSensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
            onDragCancel={markJustDragged}
            accessibility={{
              announcements: dragAnnouncements,
              screenReaderInstructions: { draggable: t("drag.keyboardHint") },
            }}
          >
            <SortableContext
              items={media.map((m) => m.mediaId)}
              strategy={rectSortingStrategy}
            >
              <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {media.map((item, index) => {
                  // Prompt 7: same-story duplicate-image warning -- compares
                  // sha256 hashes of already-processed derivatives (never a
                  // storage path).
                  const duplicateCount = item.sha256
                    ? media.filter((m) => m.sha256 === item.sha256).length
                    : 1;
                  const isDuplicate = duplicateCount > 1;
                  const isPlaced = inlineMediaIds.has(item.mediaId);
                  // Resolved once per tile: it appears in four accessible names
                  // below, and itemName() needs the numbered fallback message.
                  const name = itemName(item, index, (position) =>
                    t("itemName", { index: position }),
                  );
                  const processingLabel = (state: string) =>
                    PROCESSING_LABEL_KEYS[state]
                      ? t(`state.${PROCESSING_LABEL_KEYS[state]}` as never)
                      : state;

                  const thumb = (
                    <div className="js-image-thumb group/tile relative aspect-square overflow-hidden rounded-md border border-border-subtle bg-surface-muted">
                      {thumbnails[item.mediaId] ? (
                        <LightboxPhoto
                          url={thumbnails[item.mediaId]}
                          alt={item.altText ?? ""}
                          caption={item.caption}
                          className="block h-full w-full"
                        >
                          <ResolvingImage
                            key={thumbnails[item.mediaId]}
                            src={thumbnails[item.mediaId]}
                            alt={item.altText ?? ""}
                            loadingLabel={tImages("loading")}
                            wrapperClassName="relative block h-full w-full"
                            className="h-full w-full object-cover"
                            draggable={false}
                            onError={() => retryThumbnail(item.mediaId)}
                          />
                        </LightboxPhoto>
                      ) : item.processingState === "failed" ? (
                        <div className="flex h-full w-full items-center justify-center px-2 text-center text-xs text-muted-foreground">
                          {processingLabel(item.processingState)}
                        </div>
                      ) : (
                        <div
                          className="flex h-full w-full items-center justify-center text-muted-foreground"
                          aria-label={processingLabel(item.processingState)}
                        >
                          <Spinner className="h-6 w-6" />
                        </div>
                      )}

                      {/* Status reads off the tile itself, the way a media
                      library does it -- no field, no sentence, just the
                      three facts that change what you would do next. */}
                      <div className="pointer-events-none absolute left-1 right-[4.75rem] top-1 flex flex-wrap gap-1">
                        {item.isCover && (
                          <TileBadge>{t("badges.cover")}</TileBadge>
                        )}
                        {isPlaced && (
                          <TileBadge>{t("badges.inStory")}</TileBadge>
                        )}
                        {isDuplicate && (
                          <TileBadge tone="warning">
                            {t("badges.duplicate")}
                          </TileBadge>
                        )}
                      </div>

                      {/* Always-on hint that a tap/click opens the photo large.
    Decorative and click-through: the photo underneath is
    already the (labelled) lightbox button. */}
                      {/* Top-right corner: the zoom hint and, beside it, a
                      one-tap delete (confirmed first). Delete is a real
                      button; the zoom hint stays click-through. */}
                      <div className="absolute right-1.5 top-1.5 flex items-center gap-1.5">
                        {thumbnails[item.mediaId] && (
                          <span
                            aria-hidden="true"
                            className="pointer-events-none grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white shadow-sm"
                          >
                            <ZoomIcon />
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(item.mediaId)}
                          aria-label={t("deletePhotoLabel", { name })}
                          title={t("deletePhoto")}
                          className="press grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white shadow-sm transition-colors hover:bg-red-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>

                      <button
                        type="button"
                        // Opens the details sheet over the grid. The sheet is
                        // a native modal <dialog>, which hands focus back to
                        // this button on close by itself.
                        onClick={() => setOpenMediaId(item.mediaId)}
                        aria-haspopup="dialog"
                        // aria-label, NOT visible text plus an sr-only span:
                        // the accessible-name algorithm trims each element's
                        // text before joining them with no separator, so
                        // "Describe" + <span> photo 1</span> is announced as
                        // "Describephoto 1".
                        aria-label={t("detailsLabel", { name })}
                        // Shown on hover with a mouse (Tailwind 4's hover:
                        // only applies where the device can hover), on keyboard
                        // focus, always on touch screens (no hover there), and
                        // always while there's no photo to look at yet -- a
                        // failed upload still needs Details to be removed.
                        className={`absolute bottom-1.5 left-1/2 -translate-x-1/2 rounded-md bg-black/70 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-opacity focus-visible:opacity-100 group-hover/tile:opacity-100 [@media(hover:none)]:opacity-100 ${
                          thumbnails[item.mediaId] ? "opacity-0" : "opacity-100"
                        }`}
                      >
                        {t("details")}
                      </button>
                    </div>
                  );

                  return (
                    <SortablePhotoTile
                      key={item.mediaId}
                      id={item.mediaId}
                      disabled={false}
                      className="flex flex-col gap-1.5"
                    >
                      {(drag) => (
                        <>
                          <div
                            {...drag.listeners}
                            onClickCapture={(e) => {
                              if (justDraggedRef.current) {
                                e.preventDefault();
                                e.stopPropagation();
                              }
                            }}
                            className={`${
                              drag.listeners
                                ? "cursor-grab touch-manipulation select-none [-webkit-touch-callout:none] active:cursor-grabbing"
                                : ""
                            } ${
                              drag.isDragging
                                ? "[&_.js-image-thumb]:shadow-lg [&_.js-image-thumb]:ring-2 [&_.js-image-thumb]:ring-accent"
                                : ""
                            }`}
                          >
                            {thumb}
                          </div>
                          {/* Keyboard reorder. Hidden until it has keyboard
                              focus and click-through for mouse and touch,
                              which drag the photo itself. */}
                          <button
                            type="button"
                            ref={drag.keyboardHandle.ref}
                            onKeyDown={drag.keyboardHandle.onKeyDown}
                            aria-describedby={
                              drag.keyboardHandle["aria-describedby"]
                            }
                            aria-roledescription={
                              drag.keyboardHandle["aria-roledescription"]
                            }
                            aria-pressed={drag.keyboardHandle["aria-pressed"]}
                            aria-disabled={drag.keyboardHandle["aria-disabled"]}
                            aria-label={t("drag.handleLabel", { name })}
                            data-photo-move-handle
                            className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-md bg-black/80 px-3 py-1.5 text-xs font-medium text-white opacity-0 shadow-sm focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                          >
                            {t("drag.handle")}
                          </button>
                        </>
                      )}
                    </SortablePhotoTile>
                  );
                })}
                {/* Photos on their way in sit at the end of the same grid,
                    the size of a real tile, so each one turns into its
                    finished photo in place instead of a separate row
                    pushing the grid down. One spinner at a time: the photo
                    being sent; the ones behind it wait, dimmed. No words on
                    screen -- the state is spelled out for screen readers. */}
                {uploading.map((u) => {
                  const isActive = u.progress !== "queued";
                  return (
                    <li
                      key={u.key}
                      data-upload-queue-item
                      className="relative aspect-square overflow-hidden rounded-md border border-border-subtle bg-surface-muted"
                    >
                      {u.previewUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element -- a local object URL for the file being uploaded, not an optimizable static asset */
                        <img
                          src={u.previewUrl}
                          alt=""
                          className={`h-full w-full object-cover transition-opacity duration-300 ${
                            isActive ? "opacity-80" : "opacity-35"
                          }`}
                        />
                      ) : null}
                      {isActive ? (
                        <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/25 p-2 text-center text-xs text-white">
                          {u.paused ? null : <Spinner className="h-7 w-7" />}
                          {u.paused ? (
                            <span data-upload-paused>{t("state.paused")}</span>
                          ) : null}
                        </span>
                      ) : null}
                      <span className="sr-only">
                        {u.fileName}:{" "}
                        {u.progress === "queued"
                          ? t("state.queued")
                          : u.paused
                            ? t("state.paused")
                            : u.progress === "uploading"
                              ? t("state.uploading")
                              : t("state.processing")}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </SortableContext>
          </DndContext>
        </div>
      )}
      {/* Photo details open as a sheet over the grid -- the same bottom
          sheet as the country picker on a phone, a centered card at md+ --
          so the other photos never move to make room for the form. */}
      <BottomSheet
        open={openItem !== null}
        onClose={closeDetails}
        title={t("detailsTitle")}
        desktop="center"
        footer={
          <button
            type="button"
            onClick={closeDetails}
            className="journiq-button w-full bg-accent text-sm font-semibold text-accent-foreground"
          >
            {t("done")}
          </button>
        }
      >
        {openItem !== null && (
          <div className="space-y-4 px-2 pt-1">
            {thumbnails[openItem.mediaId] ? (
              <div className="mx-auto aspect-square w-40 overflow-hidden rounded-lg border border-border-subtle bg-surface-muted">
                <ResolvingImage
                  src={thumbnails[openItem.mediaId]}
                  alt={openItem.altText ?? ""}
                  loadingLabel={tImages("loading")}
                  wrapperClassName="relative block h-full w-full"
                  className="h-full w-full object-cover"
                  onError={() => retryThumbnail(openItem.mediaId)}
                />
              </div>
            ) : null}
            <div>
              <label
                htmlFor={`caption-${openItem.mediaId}`}
                className="block text-sm font-medium"
              >
                {t("caption")}{" "}
                <span className="font-normal text-muted-foreground">
                  {t("captionHint")}
                </span>
              </label>
              <input
                id={`caption-${openItem.mediaId}`}
                type="text"
                value={openItem.caption ?? ""}
                onChange={(e) =>
                  updateCaption(openItem.mediaId, e.target.value)
                }
                // 16px: anything smaller makes iOS zoom the page on focus.
                className="mt-1.5 w-full rounded-md border border-border-subtle px-3 py-2 text-base dark:bg-transparent"
              />
            </div>
            <div className="flex flex-wrap gap-2 border-t border-border-subtle pt-4">
              {!openItem.isCover && (
                <TileAction onClick={() => setCover(openItem.mediaId)}>
                  {t("setAsCover")}
                </TileAction>
              )}
              <TileAction
                tone="destructive"
                onClick={() => {
                  const id = openItem.mediaId;
                  closeDetails();
                  detach(id);
                }}
              >
                {t("deletePhoto")}
              </TileAction>
            </div>
          </div>
        )}
      </BottomSheet>
      {/* Always mounted (open toggles it) so closing can play its exit
          animation; unmounting removed it from the screen at once. */}
      <ConfirmDialog
        open={confirmDeleteId !== null}
        title={t("deleteConfirmTitle")}
        description={t("deleteConfirmBody")}
        confirmLabel={t("deletePhoto")}
        danger
        onConfirm={() => {
          if (confirmDeleteId) detach(confirmDeleteId);
          setConfirmDeleteId(null);
        }}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}

/** Magnifier with a plus: "tap to see this photo large". */
function ZoomIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4M11 8v6M8 11h6" />
    </svg>
  );
}
