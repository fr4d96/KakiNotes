import Link from "next/link";
import { useTranslations } from "next-intl";
import { getCardCoverUrl } from "@/lib/story/image-url";
import { firstRegionLabel } from "@/lib/story/card-fields";
import type { StoryCardData } from "@/components/story/story-card";
import { StoryCoverFallback } from "@/components/story/story-cover-fallback";
import { CardPhotos } from "@/components/story/card-photos";
import type { Locale } from "@/i18n/locales";

/**
 * The home page's "Latest stories": a vertical list of cards (a grid from
 * sm up), each with its photos swipeable right there, the way a listing app
 * shows places. It used to be one sideways-scrolling row, but a row that
 * swipes sideways and photos that swipe sideways inside it fight over the
 * same gesture -- so the list scrolls down and only the photos go sideways.
 *
 * Each card is a stretched title link (the StoryCard pattern): the whole
 * card is one tap target. The photo strip sits above that overlay so it can
 * be swiped; its photos link to the same story. See CardPhotos.
 */
export function StoryShelf({
  stories,
  photos,
  locale,
}: {
  stories: StoryCardData[];
  /** Published photo URLs per story slug, cover first. */
  photos: Record<string, string[]>;
  locale: Locale;
}) {
  const t = useTranslations("common");

  return (
    <ul className="grid gap-5 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
      {stories.map((story, index) => {
        const coverUrl = getCardCoverUrl(story);
        const storyPhotos = photos[story.slug]?.length
          ? photos[story.slug]
          : coverUrl
            ? [coverUrl]
            : [];
        const record = [
          firstRegionLabel(story.regions, locale),
          story.trip_year ? String(story.trip_year) : null,
        ]
          .filter((value): value is string => Boolean(value))
          .join(" · ");

        return (
          <li key={story.slug}>
            <article className="press press-hover-only group relative flex h-full flex-col overflow-hidden rounded-[20px] border border-border-subtle bg-surface shadow-sm transition-[transform,box-shadow] hover:-translate-y-1 hover:shadow-lg">
              <div className="relative aspect-[4/3] w-full overflow-hidden bg-surface-muted">
                {storyPhotos.length > 0 ? (
                  <CardPhotos
                    urls={storyPhotos}
                    href={`/stories/${story.slug}`}
                    eager={index < 2}
                  />
                ) : (
                  <StoryCoverFallback sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw" />
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
