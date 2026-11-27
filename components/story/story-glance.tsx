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
 * pill that jumps there, so a reader who came for the money (the most
 * common question) is one tap from it instead of four screens.
 *
 * Plain facts are text; only jumps are pills (the Pill Control Rule: a pill
 * is something you can press). On a phone the row scrolls sideways and
 * bleeds to the screen edges, so the cut-off pill is the swipe hint.
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

  const jumps: { href: string; icon: ReactNode; label: string }[] = [];
  if (cost) {
    jumps.push({
      href: "#costs",
      icon: <WalletIcon className="h-4 w-4" />,
      label: t("cost", { amount: cost }),
    });
  }
  if (photoCount > 0) {
    jumps.push({
      href: "#photos",
      icon: <GalleryIcon className="h-4 w-4" />,
      label: t("photos", { count: photoCount }),
    });
  }
  if (subStoryCount > 0) {
    jumps.push({
      href: "#sub-stories",
      icon: <FolderIcon className="h-4 w-4" />,
      label: t("subStories", { count: subStoryCount }),
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
          className="nf-scroll-x -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0"
        >
          {jumps.map((jump) => (
            <li key={jump.href} className="shrink-0">
              <a
                href={jump.href}
                className="press inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border-subtle bg-surface px-3.5 text-sm font-semibold whitespace-nowrap shadow-xs relative after:absolute after:-inset-y-0.5 after:inset-x-0 after:content-['']"
              >
                <span className="text-accent">{jump.icon}</span>
                {jump.label}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
