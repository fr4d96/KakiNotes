import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  FolderIcon,
  GalleryIcon,
  JournalIcon,
  TripYearIcon,
  WalletIcon,
} from "@/components/icons";

/**
 * A story page's facts at a glance, right under the byline: when the trip
 * was and how long, the reported cost, how many photos and sub stories, and
 * how long it takes to read. Every fact that has a section of its own is a
 * cell of an info strip that jumps there, so a reader who came for the
 * money (the most common question) is one tap from it instead of four
 * screens.
 *
 * The strip is equal columns between hairlines -- value above, label
 * below, like an app store's info row -- so all of it fits a 375px screen
 * at once (owner, 2026-11-27: no sideways swiping to find the options).
 *
 * Server Component: every value arrives already formatted.
 */
export function StoryGlance({
  tripRange,
  tripDays,
  readingMinutes,
  cost,
  photoCount,
  subStoryCount,
}: {
  tripRange: string | null;
  tripDays: number | null;
  readingMinutes: number | null;
  /** Formatted total, e.g. "$502.80"; null hides the cost pill. */
  cost: string | null;
  photoCount: number;
  subStoryCount: number;
}) {
  const t = useTranslations("story.glance");

  const tripText = tripRange
    ? tripDays
      ? t("tripRangeDays", { range: tripRange, count: tripDays })
      : tripRange
    : null;
  const readText = readingMinutes
    ? t("minRead", { count: readingMinutes })
    : null;

  // Value above, label below: the strip reads like an app's info row, and
  // every cell fits the screen, so nothing needs a sideways swipe.
  const jumps: {
    href: string;
    icon: ReactNode;
    value: string;
    label: string;
  }[] = [];
  if (cost) {
    jumps.push({
      href: "#costs",
      icon: <WalletIcon className="h-4 w-4" />,
      value: cost,
      label: t("costLabel"),
    });
  }
  if (photoCount > 0) {
    jumps.push({
      href: "#photos",
      icon: <GalleryIcon className="h-4 w-4" />,
      value: String(photoCount),
      label: t("photosLabel", { count: photoCount }),
    });
  }
  if (subStoryCount > 0) {
    jumps.push({
      href: "#sub-stories",
      icon: <FolderIcon className="h-4 w-4" />,
      value: String(subStoryCount),
      label: t("subStoriesLabel", { count: subStoryCount }),
    });
  }

  if (!tripText && !readText && jumps.length === 0) return null;

  return (
    <div className="mt-4">
      {(tripText || readText) && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {tripText && (
            <span className="inline-flex items-center gap-1.5">
              <TripYearIcon className="h-4 w-4 shrink-0" />
              {tripText}
            </span>
          )}
          {readText && (
            <span className="inline-flex items-center gap-1.5">
              <JournalIcon className="h-4 w-4 shrink-0" />
              {readText}
            </span>
          )}
        </p>
      )}
      {jumps.length > 0 && (
        <ul
          aria-label={t("jumpLabel")}
          className="mt-4 grid divide-x divide-border-subtle border-y border-border-subtle"
          style={{
            gridTemplateColumns: `repeat(${jumps.length}, minmax(0, 1fr))`,
          }}
        >
          {jumps.map((jump) => (
            <li key={jump.href} className="min-w-0">
              <a
                href={jump.href}
                className="press flex min-h-16 flex-col items-center justify-center gap-0.5 px-1 py-2 text-center"
              >
                <span className="flex max-w-full items-center gap-1.5 text-base font-semibold tabular-nums text-foreground">
                  <span className="shrink-0 text-accent">{jump.icon}</span>
                  <span className="truncate">{jump.value}</span>
                </span>{" "}
                <span className="text-xs text-muted-foreground">
                  {jump.label}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
