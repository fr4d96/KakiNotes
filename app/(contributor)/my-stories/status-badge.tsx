import { useTranslations } from "next-intl";

// The labels live in messages/<locale>.json under `storyStatus`, keyed by
// the story_lifecycle_status enum value itself. "Private", not "Saved" or
// "Unpublished": it says who can see it, which is the only thing the
// contributor actually chose.

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-surface-muted text-foreground/65",
  // Same quiet treatment as Draft rather than a warning colour -- keeping a
  // story private is a normal, finished outcome, not a problem state.
  private: "bg-surface-muted text-foreground/65",
  awaiting_contributor_approval: "bg-accent/15 text-accent",
  pending_review: "bg-tag-background text-tag-foreground",
  changes_requested: "bg-accent/15 text-accent",
  published: "bg-fern/15 text-fern",
  rejected: "bg-destructive/12 text-destructive",
  archived: "bg-surface-muted text-foreground/45",
};

export function StatusBadge({ status }: { status: string }) {
  const t = useTranslations("storyStatus");
  // An enum value this app has not been taught yet renders as itself rather
  // than as a missing-message error.
  const label = t.has(status as never) ? t(status as never) : status;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${
        STATUS_STYLES[status] ?? STATUS_STYLES.draft
      }`}
    >
      {label}
    </span>
  );
}
