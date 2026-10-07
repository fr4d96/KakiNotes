import Link from "next/link";
import { useTranslations } from "next-intl";
import type { StoryFamilyLink, SubStoryLink } from "@/lib/story/sub-stories";
import type { StoryCardData } from "@/components/story/story-card";
import { StoryCoverFallback } from "@/components/story/story-cover-fallback";
import { getCardCoverUrl } from "@/lib/story/image-url";

// Type-only import above: lib/story/sub-stories.ts is "server-only", and
// erased type imports never pull it into a bundle.

/**
 * "Part of: <main story>" -- the small breadcrumb at the top of a sub
 * story's public page. Titles are plain text children, never HTML.
 */
export function PartOfStory({ parent }: { parent: StoryFamilyLink | null }) {
  const t = useTranslations("story.family");
  if (!parent) return null;
  return (
    <nav aria-label={t("partOfLabel")} className="mb-3 text-sm">
      <span className="text-muted-foreground">{t("partOf")} </span>
      <Link
        href={`/stories/${parent.slug}`}
        className="font-medium text-accent underline underline-offset-2"
      >
        {parent.title}
      </Link>
    </nav>
  );
}

/**
 * The stories linked under this main story, shown at the end of it as
 * small cards: title on the left, cover photo on the right. Card rows
 * (see matchSubStoryCards()) supply the cover; sub stories without one get
 * the usual placeholder image. Renders nothing when empty.
 */
export function SubStoryList({
  cards = [],
  subStories,
}: {
  cards?: StoryCardData[];
  /** Sub stories with no card row -- shown with the placeholder image. */
  subStories: SubStoryLink[];
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
      coverUrl: null,
    })),
  ];
  if (items.length === 0) return null;
  return (
    <section className="mt-10" aria-labelledby="sub-stories-heading">
      <h2
        id="sub-stories-heading"
        className="text-lg font-semibold tracking-tight"
      >
        {t("subStoriesHeading")}
      </h2>
      <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <li key={item.slug}>
            <SubStoryCard {...item} />
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
}: {
  slug: string;
  title: string;
  coverUrl: string | null;
}) {
  return (
    <article className="group relative flex items-center gap-2 rounded-lg border border-border-subtle bg-surface p-2 transition-shadow hover:shadow-md">
      <h3 className="min-w-0 flex-1 text-sm font-medium leading-snug">
        <Link
          href={`/stories/${slug}`}
          className="line-clamp-2 group-hover:underline underline-offset-2"
        >
          {/* Stretched link: the whole card is one click target. */}
          <span className="absolute inset-0" aria-hidden="true" />
          {title}
        </Link>
      </h3>
      <div className="relative h-10 w-14 shrink-0 overflow-hidden rounded-md bg-surface-muted">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- public bucket URLs are content-addressed, not a Next.js image-optimizable source list
          <img
            src={coverUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          <StoryCoverFallback sizes="56px" />
        )}
      </div>
    </article>
  );
}
