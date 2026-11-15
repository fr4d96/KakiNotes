import { useTranslations } from "next-intl";
import { LoadingScreen, Skeleton } from "@/components/ui/skeleton";

/**
 * Folders' own fallback, shaped like the page it stands in for
 * (story-folders-view.tsx): the intro line, the "New folder" pill, then
 * folder rows -- icon, title, sub story count, journey icon. Without it the
 * Folders tab borrowed the contributor area's My Stories skeleton, whose
 * thumbnail rows looked nothing like folders and jumped on arrival.
 *
 * Every bar is a relative width inside a min-w-0 column, so nothing can push
 * a row past the edge of a phone screen.
 */
export default function StoryFoldersLoading() {
  const t = useTranslations("common.loadingLabels");
  return (
    <LoadingScreen
      label={t("folders")}
      className="mx-auto max-w-3xl px-4 pt-4 pb-12 sm:px-6 sm:py-16"
    >
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3.5 w-full max-w-md" />
        <Skeleton className="h-3.5 w-3/5 max-w-xs" />
      </div>
      <Skeleton className="mt-5 h-12 w-36 rounded-full" />

      <Skeleton className="mt-8 h-3.5 w-24" />
      <div className="mt-2 flex flex-col gap-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div
            key={i}
            className="nf-skeleton-group flex min-h-14 items-center gap-3 rounded-lg border border-border-subtle bg-surface px-3"
          >
            <Skeleton className="h-5 w-5 shrink-0 rounded" />
            <Skeleton className="h-4 min-w-0 flex-1 max-w-48" />
            <Skeleton className="ml-auto h-3 w-16 shrink-0" />
            <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
          </div>
        ))}
      </div>
    </LoadingScreen>
  );
}
