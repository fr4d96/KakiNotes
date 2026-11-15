import { useTranslations } from "next-intl";
import { Skeleton, LoadingScreen } from "@/components/ui/skeleton";
import { StoryCardGridSkeleton } from "@/components/story/story-card-skeleton";

/**
 * /stories is the slowest public route and the one this matters most for:
 * it awaits searchParams, which forces dynamic rendering (see the comment in
 * its page.tsx), so it can never be served from a prefetched static shell.
 * Every filter change is a real round trip.
 *
 * The shape follows page.tsx exactly — same max-w-[1440px] container, the
 * seven-control filter grid at its own breakpoints, then the 1/2/3-column
 * card grid — so when the stories land nothing shifts. On a phone that means
 * no visible title (the top bar names the page), a three-line intro and the
 * one "Filters" pill instead of the grid: it used to draw the desktop shape
 * there, and the cards jumped ~500px up when the page arrived. Six cards, because
 * that fills one viewport at the lg breakpoint without pretending to know how
 * many results the filters will actually return.
 */
export default function StoriesLoading() {
  const t = useTranslations("common.loadingLabels");
  return (
    <LoadingScreen
      label={t("stories")}
      className="mx-auto max-w-[1440px] px-4 pt-4 pb-12 sm:px-6 sm:py-16"
    >
      <div className="max-w-2xl">
        {/* The real <h1> is screen-reader-only below md (the top bar names
            the page), so its placeholder is too -- otherwise everything
            under it jumped up when the stories arrived. */}
        <Skeleton className="h-9 w-40 max-md:hidden sm:h-11" />
        {/* The intro paragraph: mt-3, 24px lines -- three on a phone, as the
            real copy wraps there. Each bar + gap is one 24px line. */}
        <div className="mt-3 flex flex-col gap-2 py-1">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full md:w-4/5" />
          <Skeleton className="h-4 w-1/2 md:hidden" />
        </div>
      </div>

      <div className="mt-8 rounded-xl border border-border-subtle bg-surface p-4 shadow-sm">
        {/* Same box as the real search label: 20px text, 4px gap, 44px field. */}
        <div className="mb-4 flex flex-col gap-1">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-11 w-full rounded-md" />
        </div>
        {/* Phone: the filters live in a bottom sheet behind one pill. */}
        <Skeleton className="h-11 w-28 rounded-full md:hidden" />
        {/* md up: the fields inline, then Apply / Clear. */}
        <div className="hidden grid-cols-2 gap-4 md:grid lg:grid-cols-4">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-10 w-full rounded-md" />
            </div>
          ))}
        </div>
        <div className="mt-4 hidden gap-3 md:flex">
          <Skeleton className="h-11 w-20 rounded-md" />
          <Skeleton className="h-11 w-20 rounded-md" />
        </div>
      </div>

      <div className="mt-8">
        <StoryCardGridSkeleton count={6} />
      </div>
    </LoadingScreen>
  );
}
