"use client";

import { useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  getStoryStarters,
  seededRandom,
  shuffleStarters,
} from "@/lib/story/story-starters";

// Same ring the rest of the contributor UI uses.
const BUTTON_FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/**
 * Writing prompts for a stuck contributor. Closed by default: the story
 * editor opens it from the light bulb beside the "Your story" heading, and
 * "Hide" (like a second tap on the bulb) closes it again -- nothing is
 * remembered, so it never nags and never disappears for good.
 */
export type StoryStartersCardProps = {
  /** DOM id, so the light bulb button can point at it (aria-controls). */
  id?: string;
  storyId: string;
  bodyIsEmpty: boolean;
  onHide: () => void;
  onWriteAbout: (heading: string) => void;
  onInsertOutline: () => void;
};

export function StoryStartersCard({
  id,
  storyId,
  bodyIsEmpty,
  onHide,
  onWriteAbout,
  onInsertOutline,
}: StoryStartersCardProps) {
  const t = useTranslations("editor.starters");
  const locale = useLocale() as "en" | "zh-CN";
  const titleId = useId();

  // Seeded from the story id, not Math.random: this initializer runs once on
  // the server and again in the browser during hydration, and both passes
  // must land on the same first prompt or React throws away the whole
  // server-rendered tree. Different stories still get different orders.
  const [prompts] = useState(() =>
    shuffleStarters(getStoryStarters(locale).prompts, seededRandom(storyId)),
  );
  const [index, setIndex] = useState(0);
  if (prompts.length === 0) return null;

  const current = prompts[index];

  function handleAnother() {
    setIndex((current) => (current + 1) % prompts.length);
  }

  return (
    <aside
      id={id}
      aria-labelledby={titleId}
      className="mt-2 mb-3 rounded-md border border-border-subtle bg-surface-muted px-3 py-2.5 text-sm"
    >
      <p
        id={titleId}
        className="text-xs uppercase tracking-wide text-muted-foreground"
      >
        {t("title")}
      </p>
      <p
        aria-live="polite"
        className="mt-1 text-balance text-base font-medium leading-snug"
      >
        {current.question}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onWriteAbout(current.heading)}
          className={`${BUTTON_FOCUS} rounded-md border border-border-subtle bg-surface px-3 py-1.5 text-sm font-medium`}
        >
          {t("writeAbout")}
        </button>
        <button
          type="button"
          onClick={handleAnother}
          className={`${BUTTON_FOCUS} rounded-md px-2 py-1.5 text-sm underline-offset-2 hover:underline`}
        >
          {t("another")}
        </button>
        <button
          type="button"
          onClick={onHide}
          className={`${BUTTON_FOCUS} rounded-md px-2 py-1.5 text-sm text-muted-foreground underline-offset-2 hover:underline`}
        >
          {t("hide")}
        </button>
      </div>
      {bodyIsEmpty && (
        <p className="mt-2 text-sm text-muted-foreground">
          {t("outlineLead")}{" "}
          <button
            type="button"
            onClick={onInsertOutline}
            className={`${BUTTON_FOCUS} rounded-sm text-sm underline underline-offset-2`}
          >
            {t("outlineAction")}
          </button>
        </p>
      )}
    </aside>
  );
}
