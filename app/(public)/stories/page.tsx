import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import {
  listPublishedStories,
  listDistinctPublicTravelStyles,
  listPublicRegions,
  listPublicDestinations,
  listPublicTags,
} from "@/lib/story/public-queries";
import { parseStorySearchParams } from "@/lib/validation/discovery";
import { FilterBar } from "@/components/story/filter-bar";
import { StoryCard } from "@/components/story/story-card";
import { hasVocabOverlay, localizeVocabName } from "@/lib/i18n/vocab";

// No `export const revalidate` here on purpose. This route awaits
// `searchParams` (the filter state), which forces dynamic rendering in the App
// Router -- confirmed in the production build output, where /stories is
// `ƒ (Dynamic) server-rendered on demand` with no revalidate period. (Since
// the language cookie, 2026-09-14, every route is `ƒ`; the difference now is
// that `/` caches its data for a minute and this page deliberately does not,
// so a filter result is always fresh.) A `revalidate` export here would be a
// silent no-op, so don't re-add one. Making this page genuinely cacheable
// would mean moving the filtering client-side, which is a separate, larger
// piece of work.

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("stories");
  return { title: t("metaTitle"), description: t("metaDescription") };
}

type SearchParams = Record<string, string | string[] | undefined>;

export default async function StoriesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const rawParams = await searchParams;
  const filters = parseStorySearchParams(rawParams);
  const [t, tVocab, locale] = await Promise.all([
    getTranslations("stories"),
    getTranslations("vocab"),
    getLocale(),
  ]);

  const [regions, destinations, tags, travelStyles] = await Promise.all([
    listPublicRegions(),
    listPublicDestinations(),
    listPublicTags(),
    listDistinctPublicTravelStyles(),
  ]);

  let stories: Awaited<ReturnType<typeof listPublishedStories>> = [];
  let loadError = false;
  try {
    stories = await listPublishedStories({
      regionId: filters.region,
      destinationId: filters.destination,
      tagId: filters.tag,
      tripYear: filters.tripYear,
      travelStyle: filters.travelStyle,
      costBand: filters.costBand,
      hasReportedExpense: filters.hasReportedExpense,
      search: filters.q,
      cursorPublishedAt: filters.cursorPublishedAt,
      cursorId: filters.cursorId,
      limit: 20,
    });
  } catch {
    loadError = true;
  }

  const last = stories[stories.length - 1];
  const nextPageParams = new URLSearchParams();
  for (const [key, value] of Object.entries(rawParams)) {
    if (
      typeof value === "string" &&
      key !== "cursorPublishedAt" &&
      key !== "cursorId"
    ) {
      nextPageParams.set(key, value);
    }
  }
  if (last) {
    nextPageParams.set("cursorPublishedAt", last.published_at);
    nextPageParams.set("cursorId", last.story_id);
  }
  const hasNextPage = stories.length === 20;

  // English is the database's own language, so the overlay is skipped
  // entirely rather than doing 16 + 34 no-op lookups per request.
  const localizeName = (
    kind: "regions" | "destinations",
    row: { slug: string; name: string },
  ) =>
    hasVocabOverlay(locale) ? localizeVocabName(kind, row, tVocab) : row.name;

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-12 sm:px-6 sm:py-16">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {t("title")}
        </h1>
        <p className="mt-3 text-foreground/70">{t("intro")}</p>
      </div>

      <div className="mt-8">
        {/* Only the LABEL is localized -- the option's value stays the row's
            uuid, so the submitted filter is identical in both languages and
            a shared /stories?region=… link works for everyone. */}
        <FilterBar
          regions={regions.map((r) => ({
            id: r.id,
            name: localizeName("regions", r),
          }))}
          destinations={destinations.map((d) => ({
            id: d.id,
            name: localizeName("destinations", d),
            regionId: d.regionId,
          }))}
          tags={tags}
          travelStyles={travelStyles}
          current={filters}
        />
      </div>

      <div className="mt-8" aria-live="polite">
        {loadError ? (
          <p className="rounded-md border border-border-subtle bg-surface-muted p-6 text-sm text-foreground/70">
            {t("loadError")}
          </p>
        ) : stories.length === 0 ? (
          <p className="rounded-md border border-border-subtle bg-surface-muted p-6 text-sm text-foreground/70">
            {t("noMatches")}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {stories.map((story) => (
              <StoryCard key={story.story_id} story={story} />
            ))}
          </div>
        )}
      </div>

      {hasNextPage ? (
        <div className="mt-10 flex justify-center">
          <Link
            href={`/stories?${nextPageParams.toString()}`}
            className="rounded-md border border-border-subtle px-4 py-2 text-sm font-medium hover:bg-surface-muted"
          >
            {t("loadMore")}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
