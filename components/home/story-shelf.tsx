import Link from "next/link";
import { useTranslations } from "next-intl";
import { getCardCoverUrl } from "@/lib/story/image-url";
import { firstRegionLabel } from "@/lib/story/card-fields";
import type { StoryCardData } from "@/components/story/story-card";
import { StoryCoverFallback } from "@/components/story/story-cover-fallback";
import type { Locale } from "@/i18n/locales";

/**
 * The home page's "Latest stories" row: one horizontal, scroll-snapped line
 * of compact cards, the way a phone app shelves content. It replaced the
 * draggable card stack, whose gesture needed a written instruction ("Drag a
 * card aside...") to be discoverable -- a swipe row needs none, because the
 * cut-off card at the edge is the affordance.
 *
 * Each card is a stretched title link (the StoryCard pattern): the whole
 * card is one tap target, and there is no nested link inside it. Server
 * Component; no client state.
 */
export function StoryShelf({
  stories,
  locale,
}: {
  stories: StoryCardData[];
  locale: Locale;
}) {
  const t = useTranslations("common");

  return (
    <ul className="nf-scroll-x -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pt-1 pb-3 sm:-mx-6 sm:scroll-px-6 sm:gap-4 sm:px-6 lg:-mx-8 lg:scroll-px-8 lg:px-8">
      {stories.map((story, index) => {
        const coverUrl = getCardCoverUrl(story);
        const record = [
          firstRegionLabel(story.regions, locale),
          story.trip_year ? String(story.trip_year) : null,
        ]
          .filter((value): value is string => Boolean(value))
          .join(" · ");

        return (
          <li
            key={story.slug}
            className="w-[76%] max-w-[300px] shrink-0 snap-start sm:w-[280px]"
          >
            <article className="press press-hover-only group relative flex h-full flex-col overflow-hidden rounded-[20px] border border-border-subtle bg-surface shadow-sm transition-[transform,box-shadow] hover:-translate-y-1 hover:shadow-lg">
              <div className="relative aspect-[4/3] w-full overflow-hidden bg-surface-muted">
                {coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- public bucket URLs are content-addressed, not a Next.js image-optimizable source list
                  <img
                    src={coverUrl}
                    alt=""
                    loading={index < 2 ? "eager" : "lazy"}
                    decoding="async"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                ) : (
                  <StoryCoverFallback sizes="300px" />
                )}
              </div>
              <div className="flex flex-1 flex-col gap-1.5 p-4">
                {record ? (
                  <p className="font-mono text-[0.7rem] tracking-[0.06em] text-foreground/65">
                    {record}
                  </p>
                ) : null}
                <h3 className="line-clamp-2 text-lg leading-[1.2] font-extrabold tracking-[-.02em] text-balance text-foreground">
                  <Link
                    href={`/stories/${story.slug}`}
                    className="outline-none after:absolute after:inset-0 after:rounded-[20px] focus-visible:after:ring-2 focus-visible:after:ring-accent"
                  >
                    {story.title}
                  </Link>
                </h3>
                <p className="mt-auto pt-1 text-sm text-foreground/70">
                  {story.attribution_value ?? t("anonymous")}
                </p>
              </div>
            </article>
          </li>
        );
      })}
    </ul>
  );
}
