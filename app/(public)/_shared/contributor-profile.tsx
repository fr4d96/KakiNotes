import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import {
  getPublicContributorDeduped,
  listCardPhotoUrlsCached,
  listContributorPublishedStories,
} from "@/lib/story/public-queries";
import { getPublishedContributorJourney } from "@/lib/story/journey-queries";
import { StoryCard } from "@/components/story/story-card";
import { ContributorHeader } from "@/components/contributor/contributor-header";
import { ContributorProfileTabs } from "@/components/contributor/contributor-profile-tabs";
import { countryName } from "@/lib/countries";
import { formatCountryName } from "@/lib/i18n/format";
import { vocabName } from "@/lib/i18n/vocab";
import type { Locale } from "@/i18n/locales";
import {
  countryUrlPrefix,
  hasJourneyMap,
  type CountrySlug,
} from "@/lib/story/countries";

/**
 * One contributor's public profile within one country -- /contributors/<slug>
 * (NZ) and /cn/contributors/<slug> (China) both render this. Each country is
 * its own catalogue (Rule 10/12): the facts, the story count and the story
 * list come only from that country's published stories, and a contributor
 * with none there 404s. Countries with a journey map (New Zealand,
 * Malaysia) show Stories | Journey tabs, each tab reading that country's
 * pins only.
 */

// No `export const revalidate` any more (it was 60) -- and deliberately no
// *Cached reader replacing it, for the same reason as
// app/(public)/stories/[id]/page.tsx: the export never engaged on this
// route either. The pre-i18n build already reported it as `Æ (Dynamic)`
// with an empty Revalidate column, so there is no window here to preserve
// and unstable_cache() would only ADD staleness -- a contributor who makes
// their profile private, or a story taken down from under their byline,
// must stop being listed NOW, not a minute from now (Engineering Rule 12).

export async function generateContributorProfileMetadata(
  country: CountrySlug,
  slug: string,
): Promise<Metadata> {
  const contributor = await getPublicContributorDeduped(slug, country);
  if (!contributor) return {};
  return {
    title: contributor.display_name,
    description: contributor.bio ?? undefined,
    alternates: {
      canonical: `${countryUrlPrefix(country)}/contributors/${contributor.public_slug}`,
    },
  };
}

/**
 * A row of facts derived from this contributor's published stories.
 *
 * These arrive already filtered by contributor_public_facts(), which is the
 * single place the "public + published + approved revision + consent
 * granted + not revoked" invariant is defined (Engineering Rules 10 and
 * 12). Nothing here re-queries or re-filters — a withdrawn story must not
 * be able to leave a region chip behind, and the only way to guarantee that
 * is to never compute this set anywhere else.
 */
/**
 * contributor.regions is jsonb since 20260914092352: an array of
 * `{name, name_zh_cn}` objects (Json), not the bare string[] it used to be.
 * Narrowed defensively -- a malformed entry renders nothing rather than
 * "[object Object]" or "undefined".
 */
function contributorRegionNames(regions: unknown, locale: Locale): string[] {
  if (!Array.isArray(regions)) return [];
  return regions
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const row = entry as { name?: unknown; name_zh_cn?: unknown };
      if (typeof row.name !== "string" || row.name.length === 0) return null;
      return vocabName(
        {
          name: row.name,
          name_zh_cn:
            typeof row.name_zh_cn === "string" ? row.name_zh_cn : null,
        },
        locale,
      );
    })
    .filter((v): v is string => v !== null);
}

function FactRow({ label, values }: { label: string; values: string[] }) {
  if (values.length === 0) return null;
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <dt className="text-xs uppercase tracking-wide text-foreground/50">
        {label}
      </dt>
      <dd className="flex flex-wrap gap-1.5">
        {values.map((value) => (
          <span
            key={value}
            className="rounded-full bg-surface-muted px-2.5 py-0.5 text-xs text-foreground/75"
          >
            {value}
          </span>
        ))}
      </dd>
    </div>
  );
}

export async function ContributorProfile({
  country,
  slug,
}: {
  country: CountrySlug;
  slug: string;
}) {
  const [contributor, t, locale] = await Promise.all([
    getPublicContributorDeduped(slug, country),
    getTranslations("contributors"),
    getLocale(),
  ]);
  if (!contributor) notFound();

  const [stories, journey] = await Promise.all([
    listContributorPublishedStories(contributor.contributor_id, {
      limit: 24,
      countrySlug: country,
    }),
    // [] when the RPC is unavailable: the profile renders without the tab.
    // Only countries with a journey map ask for it, and only for their own pins.
    hasJourneyMap(country)
      ? getPublishedContributorJourney(contributor.contributor_id, country)
      : Promise.resolve([]),
  ]);

  // Each card swipes through its published photos, as on the home page and
  // the Stories tab. One cached read per card; a failed read keeps the cover.
  const cardPhotos = await Promise.all(
    stories.map((story) =>
      listCardPhotoUrlsCached(story.story_id).catch(() => [] as string[]),
    ),
  );

  const from = formatCountryName(
    contributor.home_country_code,
    locale,
    countryName(contributor.home_country_code),
  );
  const storyCount = contributor.published_story_count;

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
      <ContributorHeader
        contributor={contributor}
        storyCount={storyCount}
        from={from}
      />

      <ContributorProfileTabs
        slug={contributor.public_slug ?? slug}
        active="stories"
        showJourney={journey.length > 0}
        prefix={countryUrlPrefix(country)}
      />

      {contributor.bio ? (
        // Plain text from the contributor, rendered as a React text node
        // (never HTML, Engineering Rules 6-7). whitespace-pre-line keeps the
        // line breaks they typed and collapses stray runs of spaces;
        // break-words stops a long unbroken URL widening the phone layout.
        <p
          data-testid="contributor-bio"
          className="mt-6 max-w-2xl whitespace-pre-line break-words text-foreground/70"
        >
          {contributor.bio}
        </p>
      ) : null}

      <dl className="mt-6 max-w-2xl space-y-2">
        {/* Region names arrive from contributor_public_facts() as
            {name, name_zh_cn} objects and are localized by
            contributorRegionNames() above (see lib/i18n/vocab.ts); tags stay
            as the database returned them -- they are the contributor's own
            words. */}
        <FactRow
          label={t("workedIn")}
          values={contributorRegionNames(contributor.regions, locale)}
        />
        <FactRow
          label={t("years")}
          values={(contributor.trip_years ?? []).map(String)}
        />
        <FactRow label={t("wroteAbout")} values={contributor.tags ?? []} />
      </dl>

      <div className="mt-10">
        <h2 className="text-xl font-semibold tracking-tight">
          {t("publishedStories")}
        </h2>
        {/* Small cards, two per row on a phone: the same compact grid as
            the home page's and the Stories tab's small size. */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          {stories.map((story, index) => (
            <StoryCard
              key={story.story_id}
              story={story}
              photos={cardPhotos[index]}
              basePath={`${countryUrlPrefix(country)}/stories`}
              size="small"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
