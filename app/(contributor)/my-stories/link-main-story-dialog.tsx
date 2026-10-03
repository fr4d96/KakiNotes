"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useToast } from "@/components/ui/toast";
import {
  ParentStoryPicker,
  type ParentStoryPickerOption,
} from "@/components/story/parent-story-picker";
import {
  loadLinkMainStoryDataAction,
  linkMainStoryAction,
  type LinkMainStoryDialogData,
} from "./actions";
import { ACTION_ICON_CLASS } from "./action-icon-class";
import { LinkIcon } from "@/components/icons";

/**
 * "Link" -- sets or clears a published story's main story from My Stories,
 * without leaving the page. Only rendered on published stories (the caller
 * decides; set_story_parent_story() refuses anything else with WHV15 anyway).
 *
 * The link lives on the STORY and goes public the moment it's saved -- no
 * review round (20261003051644_story_level_sub_stories.sql). Both stories
 * have already been approved on their own; the link only says they belong
 * together.
 */
export function LinkMainStoryAction({
  storyId,
  title,
  className,
}: {
  storyId: string;
  title: string;
  className?: string;
}) {
  const t = useTranslations("myStories");
  const router = useRouter();
  const { showToast } = useToast();
  const dialogRef = useRef<HTMLDialogElement>(null);
  // Native <dialog>.showModal()/close() are specified to save and restore
  // focus to whatever was focused beforehand, but jsdom's stub (tests/
  // vitest.setup.ts) doesn't implement that part, and relying on it alone
  // would leave this WCAG requirement unverified. Restoring explicitly here
  // means it holds in both the test environment and real browsers.
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [data, setData] = useState<LinkMainStoryDialogData | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function resetState() {
    setData(null);
    setLoadError(null);
    setSaveError(null);
    setSelected(null);
  }

  async function handleOpen() {
    resetState();
    setOpen(true);
    setLoading(true);
    const result = await loadLinkMainStoryDataAction(storyId);
    setLoading(false);
    if (!result.ok) {
      setLoadError(result.error);
      return;
    }
    setData(result.data);
    setSelected(result.data.parent?.storyId ?? null);
  }

  function handleClose() {
    setOpen(false);
    resetState();
    triggerRef.current?.focus();
  }

  async function handleSave() {
    if (!data) return;
    setSaving(true);
    setSaveError(null);
    const result = await linkMainStoryAction(storyId, selected);
    setSaving(false);
    if (!result.ok) {
      setSaveError(result.error);
      return;
    }
    showToast(
      selected
        ? t("linkMainStoryDialog.toast", { title })
        : t("linkMainStoryDialog.toastCleared", { title }),
    );
    handleClose();
    router.refresh();
  }

  const options: ParentStoryPickerOption[] = (data?.options ?? []).map(
    (option) => ({ storyId: option.storyId, title: option.title }),
  );
  const currentParent: ParentStoryPickerOption | null = data?.parent
    ? {
        storyId: data.parent.storyId,
        title: data.parent.title ?? data.parent.slug,
      }
    : null;
  const unchanged = selected === (data?.parent?.storyId ?? null);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleOpen}
        title={t("actions.linkMainStory", { title })}
        aria-label={t("actions.linkMainStory", { title })}
        className={`${ACTION_ICON_CLASS} text-accent ${className ?? ""}`}
      >
        <LinkIcon className="h-4 w-4" />
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClose={handleClose}
        onClick={(event) => {
          // A click landing on the <dialog> element itself (not a child)
          // hit the backdrop -- native <dialog> doesn't close on that by
          // default (components/ui/confirm-dialog.tsx uses the same check).
          if (event.target === dialogRef.current) handleClose();
        }}
        className="journiq-modal m-auto w-[min(92vw,26rem)] rounded-2xl border border-border-subtle bg-surface p-0 text-foreground shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-sm"
      >
        <div className="px-6 py-6">
          <h2 id={titleId} className="text-lg font-semibold tracking-tight">
            {t("linkMainStoryDialog.title", { title })}
          </h2>
          <p className="mt-2 text-sm text-foreground/70">
            {t("linkMainStoryDialog.liveNote")}
          </p>

          {loading ? (
            <p className="mt-3 text-sm text-foreground/70">
              {t("linkMainStoryDialog.loading")}
            </p>
          ) : loadError ? (
            <p className="mt-3 text-sm text-destructive">{loadError}</p>
          ) : data ? (
            <div className="mt-3">
              <ParentStoryPicker
                value={selected}
                currentParent={currentParent}
                options={options}
                hasSubStories={data.hasSubStories}
                onChange={setSelected}
              />
              {saveError && (
                <p role="alert" className="mt-2 text-sm text-destructive">
                  {saveError}
                </p>
              )}
            </div>
          ) : null}

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={saving}
              className="journiq-button border border-border-subtle text-sm disabled:opacity-60"
            >
              {t("linkMainStoryDialog.cancel")}
            </button>
            {data && (
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || unchanged || data.hasSubStories}
                className="journiq-button bg-accent text-sm text-accent-foreground disabled:opacity-60"
              >
                {saving
                  ? t("linkMainStoryDialog.saving")
                  : t("linkMainStoryDialog.save")}
              </button>
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}
