"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { BackLink } from "@/components/back-link";
import { setStoryParentAction } from "./actions";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { useIsPhone } from "@/components/ui/use-is-phone";
import { StatusBadge } from "../status-badge";
import {
  ChevronIcon,
  FolderIcon,
  PlusIcon,
  StorySearchIcon,
} from "@/components/icons";
import type { StoryFolderEntry } from "@/lib/story/story-folders";

/** Past this many candidates the picker grows a search box. */
const SEARCH_THRESHOLD = 6;

/**
 * Story folders (supabase/migrations/20261021085920_story_folders.sql). One
 * level only: a published main story groups published sub stories under it.
 *
 * Tap-first (2026-10-30), replacing drag-and-drop, which had no usable
 * gesture on a phone: "New folder" opens a two-step picker -- tap the main
 * story, then tick its sub stories -- and every folder has its own "Add sub
 * stories" that jumps straight to step two. Only folders that actually hold
 * sub stories are listed; unfiled published stories appear in the picker
 * instead of as a long list of empty rows, and drafts (never fileable) are
 * one line of text. On a phone the picker is a BottomSheet; from md up it
 * sits inline under the button (components/ui/use-is-phone.ts).
 *
 * Every filing calls setStoryParentAction, one story at a time, which
 * re-derives ownership and eligibility server-side (Engineering Rule 2) --
 * the eligibility filters here only keep impossible choices out of the list.
 */
export function StoryFoldersView({
  stories: initialStories,
}: {
  stories: StoryFolderEntry[];
}) {
  const t = useTranslations("storyFolders");
  const router = useRouter();
  const { showToast } = useToast();
  const isPhone = useIsPhone();
  const [stories, setStories] = useState(initialStories);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<StoryFolderEntry | null>(
    null,
  );
  // null = picker closed; mainId null = step one (pick the main story).
  const [picker, setPicker] = useState<{ mainId: string | null } | null>(null);

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
  const subCount = (id: string) => childrenOf.get(id)?.length ?? 0;

  const folders = stories.filter((s) => subCount(s.id) > 0);
  const draftCount = stories.filter(
    (s) => !s.linkable && !s.parentStoryId && subCount(s.id) === 0,
  ).length;

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /**
   * Applies the picker's ticks: `addIds` are filed under the main story,
   * `removeIds` (its sub stories the contributor unticked) are taken out.
   */
  async function saveFolder(
    mainId: string,
    addIds: string[],
    removeIds: string[],
  ) {
    const main = byId.get(mainId);
    if (!main || addIds.length + removeIds.length === 0) return;
    const changes = new Map<string, string | null>([
      ...addIds.map((id) => [id, mainId] as const),
      ...removeIds.map((id) => [id, null] as const),
    ]);
    const previous = new Map(
      [...changes.keys()].map((id) => [
        id,
        byId.get(id)?.parentStoryId ?? null,
      ]),
    );

    setPending(true);
    // Optimistic: show the folder as saved straight away.
    setStories((prev) =>
      prev.map((s) =>
        changes.has(s.id) ? { ...s, parentStoryId: changes.get(s.id)! } : s,
      ),
    );
    setPicker(null);
    setExpanded((prev) => new Set(prev).add(mainId));

    const failed: string[] = [];
    let firstError: string | null = null;
    // One at a time: each call is its own checked, logged mutation, and
    // their cache invalidations don't race.
    for (const [id, parentId] of changes) {
      const result = await setStoryParentAction(id, parentId, previous.get(id));
      if (!result.ok) {
        failed.push(id);
        firstError ??= result.error;
      }
    }

    setPending(false);
    if (failed.length > 0) {
      setStories((prev) =>
        prev.map((s) =>
          failed.includes(s.id)
            ? { ...s, parentStoryId: previous.get(s.id) ?? null }
            : s,
        ),
      );
      showToast(firstError ?? "", "error");
    }
    if (failed.length < changes.size) {
      const finalCount = stories.filter((s) =>
        changes.has(s.id) && !failed.includes(s.id)
          ? changes.get(s.id) === mainId
          : s.parentStoryId === mainId,
      ).length;
      showToast(
        t("toasts.saved", { count: finalCount, parent: main.title ?? "" }),
      );
      router.refresh();
    }
  }

  async function removeStory(story: StoryFolderEntry) {
    const previousParentId = story.parentStoryId;
    setPending(true);
    setStories((prev) =>
      prev.map((s) => (s.id === story.id ? { ...s, parentStoryId: null } : s)),
    );
    const result = await setStoryParentAction(story.id, null, previousParentId);
    setPending(false);
    if (!result.ok) {
      setStories((prev) =>
        prev.map((s) =>
          s.id === story.id ? { ...s, parentStoryId: previousParentId } : s,
        ),
      );
      showToast(result.error, "error");
      return;
    }
    showToast(t("toasts.removed", { child: story.title ?? "" }));
    router.refresh();
  }

  if (stories.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <StoryFoldersHeader />
        <p className="mt-6 text-sm text-muted-foreground">{t("empty")}</p>
      </div>
    );
  }

  const pickerBody = picker ? (
    <FolderPicker
      key={picker.mainId ?? "main"}
      stories={stories}
      mainId={picker.mainId}
      subCount={subCount}
      byId={byId}
      onPickMain={(id) => setPicker({ mainId: id })}
      onBack={() => setPicker({ mainId: null })}
      onCancel={() => setPicker(null)}
      onSave={saveFolder}
      pending={pending}
      inSheet={isPhone}
    />
  ) : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <StoryFoldersHeader />
      <p className="mt-2 text-sm text-muted-foreground">{t("intro")}</p>

      <button
        type="button"
        onClick={() => setPicker({ mainId: null })}
        aria-expanded={!isPhone ? picker !== null : undefined}
        className="press mt-5 inline-flex min-h-12 items-center gap-2 rounded-full bg-accent px-5 text-sm font-bold text-accent-foreground"
      >
        <PlusIcon className="h-4 w-4" />
        {t("newFolder")}
      </button>

      {isPhone ? (
        <BottomSheet
          open={picker !== null}
          onClose={() => setPicker(null)}
          title={picker?.mainId ? t("picker.subTitle") : t("picker.mainTitle")}
        >
          {pickerBody}
        </BottomSheet>
      ) : pickerBody ? (
        <div className="mt-4 rounded-lg border border-border-subtle bg-surface p-4">
          <h2 className="font-semibold">
            {picker?.mainId ? t("picker.subTitle") : t("picker.mainTitle")}
          </h2>
          {pickerBody}
        </div>
      ) : null}

      <section className="mt-8" aria-labelledby="your-folders-heading">
        <h2
          id="your-folders-heading"
          className="text-sm font-semibold text-muted-foreground"
        >
          {t("yourFolders")}
        </h2>
        {folders.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t("noFolders")}</p>
        ) : (
          <ul className="mt-2 space-y-3">
            {folders.map((folder) => (
              <FolderRow
                key={folder.id}
                folder={folder}
                subStories={childrenOf.get(folder.id) ?? []}
                expanded={expanded.has(folder.id)}
                onToggle={() => toggleExpanded(folder.id)}
                onAdd={() => setPicker({ mainId: folder.id })}
                pending={pending}
                onRequestRemove={setRemoveTarget}
              />
            ))}
          </ul>
        )}
      </section>

      {draftCount > 0 ? (
        <p className="mt-6 text-xs text-muted-foreground">
          {t("draftsNote", { count: draftCount })}
        </p>
      ) : null}

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
        pending={pending}
        onConfirm={() => {
          if (removeTarget) removeStory(removeTarget);
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
    <div className="flex items-center gap-3">
      <BackLink />
      <h1 className="journiq-heading text-[2rem] max-md:sr-only">
        {t("title")}
      </h1>
    </div>
  );
}

/**
 * Step one (mainId null): every published story not itself filed under
 * another is a possible main story. Step two edits that folder: its current
 * sub stories start ticked (untick to take one out), and any other published
 * story with no sub stories of its own (one level only, WHV14) can be ticked
 * in. A story already in ANOTHER folder is offered too, labelled, since
 * adding it here moves it. Drafts never appear: set_story_parent() refuses
 * them, so they are summed up on the page instead.
 */
function FolderPicker({
  stories,
  mainId,
  subCount,
  byId,
  onPickMain,
  onBack,
  onCancel,
  onSave,
  pending,
  inSheet,
}: {
  stories: StoryFolderEntry[];
  mainId: string | null;
  subCount: (id: string) => number;
  byId: Map<string, StoryFolderEntry>;
  onPickMain: (id: string) => void;
  onBack: () => void;
  onCancel: () => void;
  onSave: (mainId: string, addIds: string[], removeIds: string[]) => void;
  pending: boolean;
  inSheet: boolean;
}) {
  const t = useTranslations("storyFolders");
  const [query, setQuery] = useState("");
  const main = mainId ? byId.get(mainId) : undefined;
  // The folder's sub stories as they are now -- the starting ticks, and
  // what Save diffs against. FolderPicker is keyed by mainId, so this is
  // read once per folder opened.
  const [current] = useState(
    () =>
      new Set(
        main
          ? stories.filter((s) => s.parentStoryId === main.id).map((s) => s.id)
          : [],
      ),
  );
  const [selected, setSelected] = useState<Set<string>>(() => new Set(current));

  const candidates = main
    ? [
        // Its own sub stories first, ticked.
        ...stories.filter((s) => current.has(s.id)),
        ...stories.filter(
          (s) =>
            s.linkable &&
            s.id !== main.id &&
            !current.has(s.id) &&
            subCount(s.id) === 0,
        ),
      ]
    : stories.filter((s) => s.linkable && !s.parentStoryId);
  const addIds = [...selected].filter((id) => !current.has(id));
  const removeIds = [...current].filter((id) => !selected.has(id));
  const changed = addIds.length + removeIds.length > 0;
  const needle = query.trim().toLowerCase();
  const shown = needle
    ? candidates.filter((s) =>
        (s.title ?? s.slug).toLowerCase().includes(needle),
      )
    : candidates;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className={inSheet ? "" : "mt-1"}>
      {main ? (
        <p className="text-sm text-muted-foreground">
          {t("picker.subHint", { parent: main.title ?? "" })}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">{t("picker.mainHint")}</p>
      )}

      {candidates.length > SEARCH_THRESHOLD ? (
        // Same shape as the stories filter bar's search: the border sits on
        // the input itself, so the app's one focus ring wraps it cleanly.
        // text-base (16px) stops iOS zooming the page on focus.
        <label className="relative mt-3 block">
          <span className="sr-only">{t("picker.search")}</span>
          <StorySearchIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-foreground/50" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("picker.search")}
            className="min-h-11 w-full rounded-md border border-border-subtle bg-surface py-2 pr-3 pl-9 text-base"
          />
        </label>
      ) : null}

      {candidates.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          {main ? t("picker.noCandidates") : t("empty")}
        </p>
      ) : shown.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          {t("picker.noMatches")}
        </p>
      ) : main ? (
        <ul className="mt-3 divide-y divide-border-subtle">
          {shown.map((story) => {
            const currentParent =
              story.parentStoryId && story.parentStoryId !== main.id
                ? byId.get(story.parentStoryId)
                : undefined;
            return (
              <li key={story.id}>
                <label className="flex min-h-12 cursor-pointer items-center gap-3 py-2">
                  <input
                    type="checkbox"
                    checked={selected.has(story.id)}
                    onChange={() => toggle(story.id)}
                    className="h-5 w-5 shrink-0 accent-[var(--accent)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {story.title}
                    </span>
                    {currentParent ? (
                      <span className="block truncate text-xs text-muted-foreground">
                        {t("picker.inFolder", {
                          parent: currentParent.title ?? "",
                        })}
                      </span>
                    ) : null}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="mt-3 divide-y divide-border-subtle">
          {shown.map((story) => (
            <li key={story.id}>
              <button
                type="button"
                onClick={() => onPickMain(story.id)}
                className="flex min-h-12 w-full items-center gap-3 py-2 text-left"
              >
                <FolderIcon className="h-5 w-5 shrink-0 text-accent" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {story.title}
                </span>
                {subCount(story.id) > 0 ? (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {t("folders.subStoryCount", {
                      count: subCount(story.id),
                    })}
                  </span>
                ) : null}
                <ChevronIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap gap-3">
        {main ? (
          <>
            <button
              type="button"
              disabled={!changed || pending}
              onClick={() => onSave(main.id, addIds, removeIds)}
              className="press inline-flex min-h-12 flex-1 items-center justify-center rounded-full bg-accent px-5 text-sm font-bold text-accent-foreground disabled:opacity-50 sm:flex-none"
            >
              {t("picker.save", { count: selected.size })}
            </button>
            <button
              type="button"
              onClick={onBack}
              className="press inline-flex min-h-12 items-center justify-center rounded-full border border-border-subtle px-5 text-sm font-bold"
            >
              {t("picker.back")}
            </button>
          </>
        ) : !inSheet ? (
          <button
            type="button"
            onClick={onCancel}
            className="press inline-flex min-h-11 items-center justify-center rounded-full border border-border-subtle px-5 text-sm font-bold"
          >
            {t("picker.cancel")}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function FolderRow({
  folder,
  subStories,
  expanded,
  onToggle,
  onAdd,
  pending,
  onRequestRemove,
}: {
  folder: StoryFolderEntry;
  subStories: StoryFolderEntry[];
  expanded: boolean;
  onToggle: () => void;
  onAdd: () => void;
  pending: boolean;
  onRequestRemove: (story: StoryFolderEntry) => void;
}) {
  const t = useTranslations("storyFolders");
  return (
    <li className="rounded-lg border border-border-subtle bg-surface">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
        className="flex min-h-14 w-full items-center gap-3 px-3 text-left"
      >
        <FolderIcon className="h-5 w-5 shrink-0 text-accent" />
        <span className="min-w-0 flex-1 truncate font-medium">
          {folder.title}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {t("folders.subStoryCount", { count: subStories.length })}
        </span>
        <ChevronIcon
          className={`h-4 w-4 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
        />
      </button>
      {expanded ? (
        <div className="border-t border-border-subtle p-2">
          {/* The main story itself, so it is as reachable as its sub
              stories. */}
          <div className="rounded-md bg-surface-muted/60 px-2 pt-2">
            <span className="text-[0.7rem] font-semibold tracking-wide text-muted-foreground uppercase">
              {t("folders.mainStory")}
            </span>
            <span className="line-clamp-2 text-sm font-medium">
              {folder.title}
            </span>
            <Link
              href={`/stories/${folder.slug}`}
              className="inline-flex min-h-11 items-center text-xs font-medium text-accent underline underline-offset-2"
            >
              {t("folders.openStory")}
            </Link>
          </div>
          <p className="mt-3 px-2 text-[0.7rem] font-semibold tracking-wide text-muted-foreground uppercase">
            {t("folders.subStories")}
          </p>
          <ul className="space-y-1">
            {subStories.map((child) => (
              // Title on its own line, actions under it: side by side, a
              // phone left the title three characters wide.
              <li key={child.id} className="rounded-md px-2 pt-2">
                <div className="flex items-start gap-2">
                  <span className="line-clamp-2 min-w-0 flex-1 text-sm font-medium">
                    {child.title}
                  </span>
                  {/* Filing requires published, so only an exception (a
                      story unpublished after filing) is worth a badge. */}
                  {child.lifecycleStatus !== "published" ? (
                    <StatusBadge status={child.lifecycleStatus} />
                  ) : null}
                </div>
                <div className="flex items-center gap-4">
                  <Link
                    href={`/stories/${child.slug}`}
                    className="inline-flex min-h-11 items-center text-xs font-medium text-accent underline underline-offset-2"
                  >
                    {t("folders.openStory")}
                  </Link>
                  <button
                    type="button"
                    onClick={() => onRequestRemove(child)}
                    disabled={pending}
                    className="min-h-11 text-xs font-medium text-destructive"
                  >
                    {t("folders.removeFromFolder")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {folder.linkable ? (
            <button
              type="button"
              onClick={onAdd}
              disabled={pending}
              className="press mt-1 inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-semibold text-accent"
            >
              <PlusIcon className="h-4 w-4" />
              {t("folders.addSubStories")}
            </button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
