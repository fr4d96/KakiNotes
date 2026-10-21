"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { setStoryParentAction } from "./actions";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { StatusBadge } from "../status-badge";
import { ChevronIcon, FolderIcon } from "@/components/icons";
import type { StoryFolderEntry } from "@/lib/story/story-folders";

/** The drop target id for "take this story out of its folder". */
const NOT_IN_FOLDER_ZONE = "not-in-folder";

/**
 * Story folders (supabase/migrations/20261021085920_story_folders.sql),
 * replacing the free-link story map (2026-10-21). One level only: a
 * published story with no parent of its own is always a potential folder
 * (even with zero sub stories yet, so there is a row to drop onto); any
 * story filed under one shows nested under it instead of in the "Not in a
 * folder" list.
 *
 * Drag-and-drop (pointer + touch + keyboard, via @dnd-kit/core -- same
 * sensor pattern as the editor's photo reorder, components/story/
 * image-upload-manager.tsx) is the primary gesture; every row also has a
 * "Move to" select as the keyboard/screen-reader and phone fallback
 * (Engineering Rule 19) -- both call the same optimistic
 * setStoryParentAction.
 */
export function StoryFoldersView({
  stories: initialStories,
}: {
  stories: StoryFolderEntry[];
}) {
  const t = useTranslations("storyFolders");
  const router = useRouter();
  const { showToast } = useToast();
  const [stories, setStories] = useState(initialStories);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<StoryFolderEntry | null>(
    null,
  );

  const byId = useMemo(() => new Map(stories.map((s) => [s.id, s])), [stories]);
  const childrenOf = useMemo(() => {
    const map = new Map<string, StoryFolderEntry[]>();
    for (const s of stories) {
      if (!s.parentStoryId) continue;
      const list = map.get(s.parentStoryId) ?? [];
      list.push(s);
      map.set(s.parentStoryId, list);
    }
    return map;
  }, [stories]);
  const hasChildren = (id: string) => (childrenOf.get(id)?.length ?? 0) > 0;

  // Any published, not-itself-filed story is a potential folder -- even
  // one with no sub stories yet, so there's a row to drop a story onto.
  const folders = stories.filter((s) => s.linkable && !s.parentStoryId);
  // Everything else that isn't already nested under a folder above.
  const notInFolder = stories.filter(
    (s) => !s.parentStoryId && !(s.linkable && !s.parentStoryId),
  );

  const folderOptions = folders.map((f) => ({ id: f.id, title: f.title }));

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function moveStory(storyId: string, parentId: string | null) {
    const story = byId.get(storyId);
    if (!story || story.id === parentId) return;
    const previousParentId = story.parentStoryId;
    if (previousParentId === parentId) return;

    setPendingId(storyId);
    // Optimistic update.
    setStories((prev) =>
      prev.map((s) =>
        s.id === storyId ? { ...s, parentStoryId: parentId } : s,
      ),
    );

    const result = await setStoryParentAction(
      storyId,
      parentId,
      previousParentId,
    );

    setPendingId(null);
    if (!result.ok) {
      // Roll back.
      setStories((prev) =>
        prev.map((s) =>
          s.id === storyId ? { ...s, parentStoryId: previousParentId } : s,
        ),
      );
      showToast(result.error, "error");
      return;
    }

    if (parentId) {
      const parent = byId.get(parentId);
      showToast(
        t("toasts.filed", {
          child: story.title ?? "",
          parent: parent?.title ?? "",
        }),
      );
    } else {
      showToast(t("toasts.removed", { child: story.title ?? "" }));
    }
    router.refresh();
  }

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 8 },
    }),
    useSensor(KeyboardSensor),
  );

  // dnd-kit's built-in screen-reader announcements read out raw ids
  // ("Draggable item 54ec… was dropped over droppable area folder-ef3b…"),
  // in English only. These name the stories instead, in the reader's
  // language (Engineering Rule 19).
  function titleFor(id: UniqueIdentifier | undefined): string {
    if (id === undefined) return "";
    const key = String(id);
    if (key === NOT_IN_FOLDER_ZONE) return t("notInFolder.heading");
    const story = byId.get(key.replace(/^folder-/, ""));
    return story?.title ?? story?.slug ?? "";
  }
  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      t("announce.start", { story: titleFor(active.id) }),
    onDragOver: ({ active, over }) =>
      over
        ? t("announce.over", {
            story: titleFor(active.id),
            target: titleFor(over.id),
          })
        : t("announce.outside", { story: titleFor(active.id) }),
    onDragEnd: ({ active, over }) =>
      over
        ? t("announce.dropped", {
            story: titleFor(active.id),
            target: titleFor(over.id),
          })
        : t("announce.cancelled", { story: titleFor(active.id) }),
    onDragCancel: ({ active }) =>
      t("announce.cancelled", { story: titleFor(active.id) }),
  };

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const storyId = String(active.id);
    if (over.id === NOT_IN_FOLDER_ZONE) {
      moveStory(storyId, null);
      return;
    }
    const parentId = String(over.id).replace(/^folder-/, "");
    moveStory(storyId, parentId);
  }

  if (stories.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <StoryFoldersHeader />
        <p className="mt-6 text-sm text-muted-foreground">{t("empty")}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <StoryFoldersHeader />
      <p className="mt-2 text-sm text-muted-foreground">{t("intro")}</p>

      <DndContext
        sensors={sensors}
        onDragEnd={handleDragEnd}
        accessibility={{
          announcements,
          screenReaderInstructions: { draggable: t("announce.instructions") },
        }}
      >
        <ul className="mt-6 space-y-3">
          {folders.map((folder) => (
            <FolderRow
              key={folder.id}
              folder={folder}
              subStories={childrenOf.get(folder.id) ?? []}
              expanded={expanded.has(folder.id)}
              onToggle={() => toggleExpanded(folder.id)}
              folderOptions={folderOptions}
              pendingId={pendingId}
              onMove={moveStory}
              onRequestRemove={setRemoveTarget}
            />
          ))}
        </ul>

        <section className="mt-8" aria-labelledby="not-in-folder-heading">
          <h2
            id="not-in-folder-heading"
            className="text-sm font-semibold text-muted-foreground"
          >
            {t("notInFolder.heading")}
          </h2>
          <NotInFolderZone>
            <ul className="mt-2 space-y-2">
              {notInFolder.map((story) => (
                <NotInFolderRow
                  key={story.id}
                  story={story}
                  folderOptions={folderOptions}
                  pendingId={pendingId}
                  hasChildren={hasChildren(story.id)}
                  onMove={moveStory}
                />
              ))}
            </ul>
          </NotInFolderZone>
        </section>
      </DndContext>

      <ConfirmDialog
        open={removeTarget !== null}
        title={t("folders.removeDialog.title")}
        description={
          removeTarget
            ? t("folders.removeDialog.description", {
                child: removeTarget.title ?? "",
                parent: byId.get(removeTarget.parentStoryId ?? "")?.title ?? "",
              })
            : undefined
        }
        confirmLabel={t("folders.removeDialog.confirm")}
        pending={removeTarget ? pendingId === removeTarget.id : false}
        onConfirm={() => {
          if (removeTarget) moveStory(removeTarget.id, null);
          setRemoveTarget(null);
        }}
        onCancel={() => setRemoveTarget(null)}
      />
    </div>
  );
}

function StoryFoldersHeader() {
  const t = useTranslations("storyFolders");
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <h1 className="journiq-heading text-[2rem]">{t("title")}</h1>
      <Link
        href="/my-stories"
        className="text-sm font-medium text-accent underline underline-offset-2"
      >
        {t("backToMyStories")}
      </Link>
    </div>
  );
}

type FolderOption = { id: string; title: string | null };

function MoveToSelect({
  story,
  folderOptions,
  disabled,
  onMove,
}: {
  story: StoryFolderEntry;
  folderOptions: FolderOption[];
  disabled: boolean;
  onMove: (storyId: string, parentId: string | null) => void;
}) {
  const t = useTranslations("storyFolders");
  const options = folderOptions.filter((f) => f.id !== story.id);
  return (
    <label className="sr-only sm:not-sr-only sm:text-xs sm:text-muted-foreground">
      {t("moveTo.label")}
      <select
        className="ml-1 min-h-[44px] rounded-md border border-border-subtle bg-surface px-2 py-1 text-sm sm:min-h-0 sm:py-0.5"
        aria-label={t("moveTo.label")}
        disabled={disabled || !story.linkable}
        value={story.parentStoryId ?? ""}
        onChange={(event) => {
          const value = event.target.value;
          onMove(story.id, value === "" ? null : value);
        }}
      >
        <option value="">{t("moveTo.notInFolderOption")}</option>
        {options.map((f) => (
          <option key={f.id} value={f.id}>
            {f.title}
          </option>
        ))}
      </select>
    </label>
  );
}

function FolderRow({
  folder,
  subStories,
  expanded,
  onToggle,
  folderOptions,
  pendingId,
  onMove,
  onRequestRemove,
}: {
  folder: StoryFolderEntry;
  subStories: StoryFolderEntry[];
  expanded: boolean;
  onToggle: () => void;
  folderOptions: FolderOption[];
  pendingId: string | null;
  onMove: (storyId: string, parentId: string | null) => void;
  onRequestRemove: (story: StoryFolderEntry) => void;
}) {
  const t = useTranslations("storyFolders");
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `folder-${folder.id}`,
  });
  const draggable = folder.linkable && subStories.length === 0;
  const {
    setNodeRef: setDragRef,
    listeners,
    isDragging,
  } = useDraggable({
    id: folder.id,
    disabled: !draggable,
  });

  return (
    <li
      ref={setDropRef}
      className={`rounded-lg border ${
        isOver ? "border-accent bg-accent/5" : "border-border-subtle"
      } bg-surface`}
      data-dragging={isDragging || undefined}
    >
      <div className="flex items-center gap-2 p-3">
        {draggable ? (
          <span
            ref={setDragRef}
            {...listeners}
            className="flex h-11 w-11 shrink-0 cursor-grab items-center justify-center rounded-md text-accent"
          >
            <FolderIcon className="h-5 w-5" />
          </span>
        ) : (
          <FolderIcon className="h-5 w-5 shrink-0 text-accent" />
        )}
        <button
          type="button"
          aria-expanded={expanded}
          onClick={onToggle}
          className="flex min-h-[44px] flex-1 items-center gap-2 text-left"
        >
          <ChevronIcon
            className={`h-4 w-4 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
          />
          <span className="min-w-0 flex-1 truncate font-medium">
            {folder.title}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {t("folders.subStoryCount", { count: subStories.length })}
          </span>
        </button>
        {/* A folder with sub stories of its own can't be filed under
            another (one level only, WHV14) -- MoveToSelect's own
            `!story.linkable` check doesn't know about that, so it's
            disabled here too. */}
        <MoveToSelect
          story={folder}
          folderOptions={folderOptions}
          disabled={pendingId === folder.id || subStories.length > 0}
          onMove={onMove}
        />
      </div>
      {expanded ? (
        <ul className="space-y-1 border-t border-border-subtle p-2">
          {subStories.length === 0 ? (
            <li className="px-2 py-1 text-sm text-muted-foreground">
              {t("folders.subStoryCount", { count: 0 })}
            </li>
          ) : (
            subStories.map((child) => (
              <SubStoryRow
                key={child.id}
                story={child}
                folderOptions={folderOptions}
                pendingId={pendingId}
                onMove={onMove}
                onRequestRemove={onRequestRemove}
              />
            ))
          )}
        </ul>
      ) : null}
    </li>
  );
}

function SubStoryRow({
  story,
  folderOptions,
  pendingId,
  onMove,
  onRequestRemove,
}: {
  story: StoryFolderEntry;
  folderOptions: FolderOption[];
  pendingId: string | null;
  onMove: (storyId: string, parentId: string | null) => void;
  onRequestRemove: (story: StoryFolderEntry) => void;
}) {
  const t = useTranslations("storyFolders");
  // A sub story can never have sub stories of its own (one level only), so
  // the only thing that can block dragging it to another folder is not
  // being published.
  const draggable = story.linkable;
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id: story.id,
    disabled: !draggable,
  });
  return (
    <li
      ref={setNodeRef}
      data-dragging={isDragging || undefined}
      className="flex min-h-[44px] flex-wrap items-center gap-2 rounded-md px-2 py-1.5"
    >
      <span
        {...(draggable ? listeners : {})}
        className={`min-w-0 flex-1 truncate text-sm ${draggable ? "cursor-grab" : ""}`}
      >
        {story.title}
      </span>
      <StatusBadge status={story.lifecycleStatus} />
      <Link
        href={`/stories/${story.slug}`}
        className="text-xs font-medium text-accent underline underline-offset-2"
      >
        {t("folders.openStory")}
      </Link>
      <button
        type="button"
        onClick={() => onRequestRemove(story)}
        disabled={pendingId === story.id}
        className="rounded-md border border-border-subtle px-2 py-1 text-xs font-medium text-destructive"
      >
        {t("folders.removeFromFolder")}
      </button>
      <MoveToSelect
        story={story}
        folderOptions={folderOptions}
        disabled={pendingId === story.id}
        onMove={onMove}
      />
    </li>
  );
}

function NotInFolderZone({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: NOT_IN_FOLDER_ZONE });
  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg border border-dashed p-2 ${
        isOver ? "border-accent bg-accent/5" : "border-border-subtle"
      }`}
    >
      {children}
    </div>
  );
}

function NotInFolderRow({
  story,
  folderOptions,
  pendingId,
  hasChildren,
  onMove,
}: {
  story: StoryFolderEntry;
  folderOptions: FolderOption[];
  pendingId: string | null;
  hasChildren: boolean;
  onMove: (storyId: string, parentId: string | null) => void;
}) {
  const t = useTranslations("storyFolders");
  const draggable = story.linkable && !hasChildren;
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id: story.id,
    disabled: !draggable,
  });
  const hint = !story.linkable
    ? t("notInFolder.publishHint")
    : hasChildren
      ? t("notInFolder.notDraggableHint")
      : null;

  return (
    <li
      ref={setNodeRef}
      data-dragging={isDragging || undefined}
      className={`flex min-h-[44px] flex-wrap items-center gap-2 rounded-md px-2 py-1.5 ${
        !story.linkable ? "text-muted-foreground" : ""
      }`}
    >
      <span
        {...(draggable ? listeners : {})}
        className={`min-w-0 flex-1 truncate text-sm ${draggable ? "cursor-grab" : ""}`}
      >
        {story.title}
      </span>
      <StatusBadge status={story.lifecycleStatus} />
      {hint ? (
        <span className="text-xs text-muted-foreground">{hint}</span>
      ) : null}
      <MoveToSelect
        story={story}
        folderOptions={folderOptions}
        disabled={pendingId === story.id}
        onMove={onMove}
      />
    </li>
  );
}
