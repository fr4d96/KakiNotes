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
import { vocabName, sortByLocalizedName } from "@/lib/i18n/vocab";
import {
  countryMessageSegment,
  countryUrlPrefix,
  type CountrySlug,
} from "@/lib/story/countries";

/**
 * The /stories and /cn/stories pages share this one renderer, parameterized
 * by country, rather than being two copies of the same ~150 lines that
 * could silently drift apart. `countrySlug` is threaded into every data
 * read (list_published_stories' p_country_slug, and the region/destination
 * pickers), which is what keeps a /cn visitor from ever being offered an NZ
 * region or story and vice versa (Rule 10/12) -- this is not just a display
 * choice, the DB-level filter is what actually enforces it.
 */

export type SearchParams = Record<string, string | string[] | undefined>;

export async function StoriesIndex({
  country,
  searchParams,
}: {
  country: CountrySlug;
  searchParams: Promise<SearchParams>;
}) {
  const rawParams = await searchParams;
  const filters = parseStorySearchParams(rawParams);
  const [t, tCountry, locale] = await Promise.all([
    getTranslations("stories"),
    getTranslations("countryContent"),
    getLocale(),
  ]);
  const segment = countryMessageSegment(country);
  const basePath = `${countryUrlPrefix(country)}/stories`;

  const [regions, destinations, tags, travelStyles] = await Promise.all([
    listPublicRegions(country),
    listPublicDestinations(),
    listPublicTags(),
    listDistinctPublicTravelStyles(),
  ]);
  // Destinations scoped to the regions this country actually has, the same
  // "no direct country_id, inherit through region_id" shape as
  // lib/story/active-lookups.ts.
  const regionIdSet = new Set(regions.map((r) => r.id));
  const scopedDestinations = destinations.filter((d) =>
    regionIdSet.has(d.regionId),
  );

  let stories: Awaited<ReturnType<typeof listPublishedStories>> = [];
  let loadError = false;
  try {
    stories = await listPublishedStories({
      countrySlug: country,
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

  const sortedRegions = sortByLocalizedName(regions, locale);
  const sortedDestinations = sortByLocalizedName(scopedDestinations, locale);

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-12 sm:px-6 sm:py-16">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {t("title")}
        </h1>
        <p className="mt-3 text-foreground/70">
          {tCountry(`${segment}.storiesIntro`)}
        </p>
      </div>

      <div className="mt-8">
        <FilterBar
          regions={sortedRegions.map((r) => ({
            id: r.id,
            name: vocabName(r, locale),
          }))}
          destinations={sortedDestinations.map((d) => ({
            id: d.id,
            name: vocabName(d, locale),
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
              <StoryCard
                key={story.story_id}
                story={story}
                basePath={basePath}
              />
            ))}
          </div>
        )}
      </div>

      {hasNextPage ? (
        <div className="mt-10 flex justify-center">
          <Link
            href={`${basePath}?${nextPageParams.toString()}`}
            className="rounded-md border border-border-subtle px-4 py-2 text-sm font-medium hover:bg-surface-muted"
          >
            {t("loadMore")}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
