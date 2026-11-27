import Link from "next/link";
import { useTranslations } from "next-intl";
import type { StoryFamilyLink } from "@/lib/story/story-folders";
import type { StoryCardData } from "@/components/story/story-card";
import { StoryCoverFallback } from "@/components/story/story-cover-fallback";
import { ResolvingImage } from "@/components/ui/resolving-image";
import { getCardCoverUrl } from "@/lib/story/image-url";
import { cardPhotoSrc } from "@/lib/story/card-photo-size";

// Type-only import above: lib/story/story-folders.ts is "server-only", and
// erased type imports never pull it into a bundle.

/**
 * "Main story: <main story>" -- the small breadcrumb at the top of a sub
 * story's public page (supabase/migrations/20261021085920_story_folders.sql).
 * Titles are plain text children, never HTML.
 */
export function PartOfStory({
  parent,
  basePath = "/stories",
}: {
  parent: StoryFamilyLink | null;
  /** See StoryCard's basePath -- defaults to the NZ path unchanged. */
  basePath?: string;
}) {
  const t = useTranslations("story.family");
  if (!parent) return null;
  return (
    <nav aria-label={t("partOfLabel")} className="mb-3 text-sm">
      <span className="text-muted-foreground">{t("partOf")} </span>
      <Link
        href={`${basePath}/${parent.slug}`}
        className="font-medium text-accent underline underline-offset-2"
      >
        {parent.title}
      </Link>
    </nav>
  );
}

/**
 * The sub stories filed under this main story, at the end of it: a row of
 * small rounded photo tiles with the title underneath -- the same boxless
 * shape as a story pin and a place tile, one size down. On a phone the row
 * swipes sideways and bleeds to the screen edges (the Edge-Bleed Rule: the
 * cut-off tile is the swipe hint), so nineteen sub stories cost one row of
 * height instead of nineteen; from `sm` it wraps into a grid. Card rows
 * (see matchStoryFamilyCards()) supply the cover; sub stories without one
 * get the usual placeholder image. Renders nothing when empty.
 */
export function SubStoryList({
  cards = [],
  subStories,
  basePath = "/stories",
}: {
  cards?: StoryCardData[];
  /**
   * Sub stories with no card row, with their cover when the page found one
   * (the placeholder image otherwise).
   */
  subStories: (StoryFamilyLink & { coverUrl?: string | null })[];
  /** See StoryCard's basePath -- defaults to the NZ path unchanged. */
  basePath?: string;
}) {
  const t = useTranslations("story.family");
  const items = [
    ...cards.map((c) => ({
      slug: c.slug,
      title: c.title,
      coverUrl: getCardCoverUrl(c),
    })),
    ...subStories.map((s) => ({
      slug: s.slug,
      title: s.title,
      coverUrl: s.coverUrl ?? null,
    })),
  ];
  if (items.length === 0) return null;
  return (
    <section
      id="sub-stories"
      className="mt-10 scroll-mt-14"
      aria-labelledby="sub-stories-heading"
    >
      <h2
        id="sub-stories-heading"
        className="flex items-baseline gap-2 text-xl font-semibold tracking-tight"
      >
        {t("subStoriesHeading")}
        {/* Visual count only: the list itself announces how many. */}
        <span
          aria-hidden="true"
          className="text-sm font-medium text-muted-foreground tabular-nums"
        >
          {items.length}
        </span>
      </h2>
      <ul className="nf-scroll-x -mx-4 mt-3 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-4 sm:overflow-visible sm:px-0 lg:grid-cols-4">
        {items.map((item) => (
          <li key={item.slug} className="w-36 shrink-0 snap-start sm:w-auto">
            <SubStoryCard {...item} basePath={basePath} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function SubStoryCard({
  slug,
  title,
  coverUrl,
  basePath,
}: {
  slug: string;
  title: string;
  coverUrl: string | null;
  basePath: string;
}) {
  const tImages = useTranslations("editor.images");
  return (
    // Boxless, like a story pin: the photo carries the shape and the title
    // sits on the page ground underneath. data-card-bounce: the same soft
    // spring on tap as a story card (components/click-pulse.tsx).
    <article
      data-card-bounce
      className="press press-hover-only group relative flex flex-col"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-surface-muted shadow-sm transition-shadow group-hover:shadow-md">
        {coverUrl ? (
          <ResolvingImage
            // A ~144px tile: the smallest card version is plenty.
            src={cardPhotoSrc(coverUrl, 640)}
            alt=""
            loading="lazy"
            loadingLabel={tImages("loading")}
            wrapperClassName="relative block h-full w-full"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <StoryCoverFallback sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 144px" />
        )}
      </div>
      <h3 className="mt-1.5 px-0.5 text-sm leading-snug font-semibold tracking-tight">
        <Link
          href={`${basePath}/${slug}`}
          className="line-clamp-2 underline-offset-2 group-hover:underline"
        >
          {/* Stretched link: the whole tile is one tap and one tab stop. */}
          <span className="absolute inset-0" aria-hidden="true" />
          {title}
        </Link>
      </h3>
    </article>
  );
}
