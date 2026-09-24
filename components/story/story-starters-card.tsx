"use client";

import { useId, useState, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  getStoryStarters,
  seededRandom,
  shuffleStarters,
} from "@/lib/story/story-starters";

/**
 * Past this many words the person is writing and the card gets out of the
 * way for good (for this mount). Deliberately well under the 150-word
 * `missing_trip_context` threshold: the card's job is the first sentence,
 * not the first section.
 */
export const STARTERS_HIDE_THRESHOLD_WORDS = 50;

// Same ring the rest of the contributor UI uses.
const BUTTON_FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

function hiddenKey(storyId: string) {
  return `kakinotes:starters-hidden:${storyId}`;
}

function readHidden(storyId: string): boolean {
  try {
    return window.localStorage.getItem(hiddenKey(storyId)) === "1";
  } catch {
    return false;
  }
}

function writeHidden(storyId: string) {
  try {
    window.localStorage.setItem(hiddenKey(storyId), "1");
  } catch {
    // Ignore storage failures (private browsing, quota, disabled storage) --
    // dismissal just won't persist across reloads.
  }
}

// No cross-instance notifications needed -- storage is only ever written by
// this same click, which also flips `dismissedLocally` directly. The
// subscription exists only to satisfy useSyncExternalStore's signature.
function subscribeNoop() {
  return () => {};
}

function getServerHiddenSnapshot() {
  return false;
}

export type StoryStartersCardProps = {
  storyId: string;
  wordCount: number;
  bodyIsEmpty: boolean;
  onWriteAbout: (heading: string) => void;
  onInsertOutline: () => void;
};

export function StoryStartersCard({
  storyId,
  wordCount,
  bodyIsEmpty,
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
  const [dismissedLocally, setDismissedLocally] = useState(false);

  // Read the dismissal flag from localStorage without a setState-in-effect
  // round trip: server render and the client's first (hydrating) pass both
  // use getServerHiddenSnapshot() (false), then React swaps to the real
  // localStorage read right after -- same "render, then hide" behaviour as
  // an effect, no hydration-mismatch warning. See components/theme-toggle.tsx
  // for the same pattern.
  const hiddenFromStorage = useSyncExternalStore(
    subscribeNoop,
    () => readHidden(storyId),
    getServerHiddenSnapshot,
  );
  const hidden = dismissedLocally || hiddenFromStorage;

  if (
    hidden ||
    wordCount >= STARTERS_HIDE_THRESHOLD_WORDS ||
    prompts.length === 0
  ) {
    return null;
  }

  const current = prompts[index];

  function handleHide() {
    writeHidden(storyId);
    setDismissedLocally(true);
  }

  function handleAnother() {
    setIndex((current) => (current + 1) % prompts.length);
  }

  return (
    <aside
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
          onClick={handleHide}
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
