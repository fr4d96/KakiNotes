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

// Uncached on purpose, for the same reason as the profile page itself
// (../page.tsx): a pin whose story is taken down, or a profile made
// private, must stop showing NOW. The RPC re-checks visibility per story.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const [contributor, t] = await Promise.all([
    getPublicContributorDeduped(slug),
    getTranslations("contributors"),
  ]);
  if (!contributor) return {};
  const journey = await getPublishedContributorJourney(
    contributor.contributor_id,
  );
  return {
    title: t("journeyMetaTitle", { name: contributor.display_name }),
    description: t("journeyMetaDescription", {
      name: contributor.display_name,
    }),
    alternates: {
      canonical: `/contributors/${contributor.public_slug}/journey`,
    },
    // An empty journey page has nothing to index.
    robots: journey.length > 0 ? undefined : { index: false, follow: true },
  };
}

export default async function ContributorJourneyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [contributor, t, locale] = await Promise.all([
    getPublicContributorDeduped(slug),
    getTranslations("contributors"),
    getLocale(),
  ]);
  if (!contributor) notFound();

  const rows = await getPublishedContributorJourney(contributor.contributor_id);
  const stops = buildJourneyStops(rows);
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
      />

      {stops.length > 0 ? (
        <>
          <p className="mt-6 max-w-2xl text-foreground/70">
            {t("journeyIntro", { name: contributor.display_name })}
          </p>
          <JourneyMap stops={stops} />
        </>
      ) : (
        <p className="mt-8 max-w-2xl text-foreground/70">
          {t("journeyEmpty", { name: contributor.display_name })}
        </p>
      )}
    </div>
  );
}
