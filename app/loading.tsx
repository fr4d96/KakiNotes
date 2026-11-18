import { useTranslations } from "next-intl";
import {
  Skeleton,
  SkeletonText,
  LoadingScreen,
} from "@/components/ui/skeleton";

/**
 * Root fallback — the LAST resort, not the usual one.
 *
 * This file used to be the only loading state in the app, and it rendered the
 * bare word "Loading…". Sitting at the root segment means it replaces the
 * route group's layout too, so every single navigation blanked the header,
 * nav and footer and left one line of text in an empty window. That is what
 * made moving between pages feel broken.
 *
 * The fix is that it is now rarely reached: every route group has its own
 * `loading.tsx` nested under its layout, which keeps the chrome on screen.
 * This one only shows when the navigation crosses INTO a different group
 * (whose layout therefore has to be built from scratch) or lands on a route
 * with no group, like /qa-index.
 *
 * Since 2026-11-18 the header and the phone tab bar are drawn by
 * app/layout.tsx itself, above and below this fallback, so they stay on
 * screen while it shows; it only stands in for the page content. (It used
 * to draw a placeholder header, from when each group drew its own.)
 */
export default function Loading() {
  const t = useTranslations("common");
  return (
    <LoadingScreen label={t("loadingPage")}>
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
        <Skeleton className="h-9 w-2/3 max-w-md sm:h-11" />
        <SkeletonText className="mt-6 max-w-2xl" lines={3} />
        <div className="mt-10 flex flex-col gap-3">
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
        </div>
      </div>
    </LoadingScreen>
  );
}
