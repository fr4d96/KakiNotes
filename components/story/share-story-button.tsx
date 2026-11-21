"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ShareStorySheet } from "@/components/story/share-story-sheet";

/**
 * "Share" on the public story page. Owns only the open state; everything the
 * sheet shows is passed in by StoryDetail and is already public on that page.
 */
export function ShareStoryButton(props: {
  title: string;
  subtitle: string;
  path: string;
  coverUrl: string | null;
}) {
  const t = useTranslations("story.share");
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="press inline-flex min-h-11 items-center gap-2 rounded-full border border-border-subtle bg-surface px-4 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.7}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="h-4 w-4"
        >
          <path d="M12 15V4" />
          <path d="m8 7.5 4-4 4 4" />
          <path d="M5 12v6.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V12" />
        </svg>
        {t("button")}
      </button>
      <ShareStorySheet open={open} onClose={() => setOpen(false)} {...props} />
    </>
  );
}
