import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { getPublicContributorDeduped } from "@/lib/story/public-queries";
import { getPublishedContributorJourney } from "@/lib/story/journey-queries";
import { buildJourneyStops } from "@/lib/journey/contributor-journey";
import { JourneyMap } from "@/components/story/journey-map";
import { ContributorHeader } from "@/components/contributor/contributor-header";
import { ContributorProfileTabs } from "@/components/contributor/contributor-profile-tabs";
import { countryName } from "@/lib/countries";
import { formatCountryName } from "@/lib/i18n/format";
import {
  countryUrlPrefix,
  type JourneyCountrySlug,
} from "@/lib/story/countries";

// Uncached on purpose, for the same reason as the profile page itself
// (contributor-profile.tsx): a pin whose story is taken down, or a profile made
// private, must stop showing NOW. The RPC re-checks visibility per story.

/**
 * One contributor's journey map in one country -- /contributors/<slug>/journey
 * (NZ) and /my/contributors/<slug>/journey (Malaysia). Only that country's
 * pins are read (get_published_contributor_journey's p_country_slug), and the
 * contributor must have a published story there (Rules 10, 12).
 */
export async function generateContributorJourneyMetadata(
  country: JourneyCountrySlug,
  slug: string,
): Promise<Metadata> {
  const [contributor, t, tCountry] = await Promise.all([
    getPublicContributorDeduped(slug, country),
    getTranslations("contributors"),
    getTranslations("countryContent"),
  ]);
  if (!contributor) return {};
  const journey = await getPublishedContributorJourney(
    contributor.contributor_id,
    country,
  );
  return {
    title: t("journeyMetaTitle", { name: contributor.display_name }),
    // New Zealand's description names its working holiday; Malaysia's is
    // its own (never WHV wording).
    description:
      country === "new-zealand"
        ? t("journeyMetaDescription", { name: contributor.display_name })
        : tCountry("malaysia.journeyMetaDescription", {
            name: contributor.display_name,
          }),
    alternates: {
      canonical: `${countryUrlPrefix(country)}/contributors/${contributor.public_slug}/journey`,
    },
    // An empty journey page has nothing to index.
    robots: journey.length > 0 ? undefined : { index: false, follow: true },
  };
}

export async function ContributorJourney({
  country,
  slug,
}: {
  country: JourneyCountrySlug;
  slug: string;
}) {
  const [contributor, t, locale] = await Promise.all([
    getPublicContributorDeduped(slug, country),
    getTranslations("contributors"),
    getLocale(),
  ]);
  if (!contributor) notFound();

  const rows = await getPublishedContributorJourney(
    contributor.contributor_id,
    country,
  );
  const stops = buildJourneyStops(rows, country);
  const from = formatCountryName(
    contributor.home_country_code,
    locale,
    countryName(contributor.home_country_code),
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
      <ContributorHeader
        contributor={contributor}
        storyCount={contributor.published_story_count}
        from={from}
      />

      <ContributorProfileTabs
        slug={contributor.public_slug ?? slug}
        active="journey"
        showJourney={rows.length > 0}
        prefix={countryUrlPrefix(country)}
      />

      {stops.length > 0 ? (
        <>
          <p className="mt-6 max-w-2xl text-foreground/70">
            {t("journeyIntro", { name: contributor.display_name })}
          </p>
          <JourneyMap stops={stops} country={country} />
        </>
      ) : (
        <p className="mt-8 max-w-2xl text-foreground/70">
          {t("journeyEmpty", { name: contributor.display_name })}
        </p>
      )}
    </div>
  );
}
