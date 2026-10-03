"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";

export type ParentStoryPickerOption = { storyId: string; title: string };

/**
 * "Main story (optional)": links a published story under another of the
 * contributor's published stories. Presentational only -- My Stories' Link
 * dialog (app/(contributor)/my-stories/link-main-story-dialog.tsx) owns the
 * selection state and the save. What may be a main story is decided by
 * set_story_parent_story() on save; this list is a convenience, not a check.
 */
export function ParentStoryPicker({
  value,
  currentParent,
  options,
  hasSubStories,
  onChange,
}: {
  /** Selected main story id, or null for none. */
  value: string | null;
  /** The saved main story, kept selectable even if it's no longer an option. */
  currentParent: ParentStoryPickerOption | null;
  options: ParentStoryPickerOption[];
  hasSubStories: boolean;
  onChange: (parentStoryId: string | null) => void;
}) {
  const t = useTranslations("editor.parentStory");
  const id = useId();
  const hintId = `${id}-hint`;

  const shown =
    currentParent && !options.some((o) => o.storyId === currentParent.storyId)
      ? [currentParent, ...options]
      : options;
  const hint = hasSubStories
    ? t("hasSubStories")
    : options.length === 0 && !currentParent
      ? t("noOptions")
      : null;

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        {t("label")}
      </label>
      <select
        id={id}
        value={value ?? ""}
        disabled={hasSubStories}
        aria-describedby={hint ? hintId : undefined}
        onChange={(e) =>
          onChange(e.target.value === "" ? null : e.target.value)
        }
        className="mt-1 w-full rounded-md border border-border-subtle px-2 py-2 text-sm disabled:opacity-60 dark:bg-transparent"
      >
        <option value="">{t("none")}</option>
        {shown.map((o) => (
          <option key={o.storyId} value={o.storyId}>
            {o.title}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-muted-foreground">{t("help")}</p>
      {hint ? (
        <p id={hintId} className="mt-1 text-xs text-foreground/80">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
