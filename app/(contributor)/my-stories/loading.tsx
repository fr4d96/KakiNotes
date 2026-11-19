import { useTranslations } from "next-intl";
import { Skeleton, LoadingScreen } from "@/components/ui/skeleton";

/**
 * My Stories' own fallback: the same page shape (toolbar, status chips, then
 * cover-left story cards) so the page does not jump when the list arrives.
 */
export default function MyStoriesLoading() {
  const t = useTranslations("common.loadingLabels");
  return (
    <LoadingScreen
      label={t("workspace")}
      className="mx-auto max-w-5xl px-4 pt-4 pb-12 sm:px-6 sm:py-16"
    >
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-10 w-40 max-md:hidden" />
        <Skeleton className="h-10 w-28 rounded-full max-md:hidden" />
      </div>
      <div className="flex items-center gap-2 md:mt-4">
        <Skeleton className="h-10 w-10 rounded-full" />
        <Skeleton className="h-10 w-10 rounded-full" />
        <Skeleton className="h-10 w-10 rounded-full" />
      </div>
      <div className="mt-5 flex gap-2">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-24 rounded-full" />
        ))}
      </div>
      <div className="mt-5 flex flex-col gap-3">
        {Array.from({ length: 5 }, (_, i) => (
          <div
            key={i}
            className="nf-skeleton-group flex gap-3.5 rounded-2xl border border-border-subtle bg-surface p-3"
          >
            <Skeleton className="aspect-[4/3] w-28 shrink-0 rounded-xl" />
            <div className="flex min-w-0 flex-1 flex-col gap-2 py-1">
              <Skeleton className="h-5 w-4/5 max-w-xs" />
              <Skeleton className="h-3.5 w-1/3" />
              <Skeleton className="h-3.5 w-3/5" />
            </div>
          </div>
        ))}
      </div>
    </LoadingScreen>
  );
}
