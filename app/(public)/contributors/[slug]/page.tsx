import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import {
  getPublicContributorDeduped,
  listContributorPublishedStories,
} from "@/lib/story/public-queries";
import { StoryCard } from "@/components/story/story-card";
import { ContributorAvatar } from "@/components/contributor/contributor-avatar";
import { countryName } from "@/lib/countries";
import { formatCountryName } from "@/lib/i18n/format";

// No `export const revalidate` any more (it was 60) -- and deliberately no
// *Cached reader replacing it, for the same reason as
// app/(public)/stories/[id]/page.tsx: the export never engaged on this
// route either. The pre-i18n build already reported it as `Æ (Dynamic)`
// with an empty Revalidate column, so there is no window here to preserve
// and unstable_cache() would only ADD staleness -- a contributor who makes
// their profile private, or a story taken down from under their byline,
// must stop being listed NOW, not a minute from now (Engineering Rule 12).

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const contributor = await getPublicContributorDeduped(slug);
  if (!contributor) return {};
  return {
    title: contributor.display_name,
    description: contributor.bio ?? undefined,
    alternates: { canonical: `/contributors/${contributor.public_slug}` },
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

export default async function ContributorDetailPage({
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

  const stories = await listContributorPublishedStories(
    contributor.contributor_id,
    { limit: 24 },
  );

  const from = formatCountryName(
    contributor.home_country_code,
    locale,
    countryName(contributor.home_country_code),
  );
  const storyCount = contributor.published_story_count;

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
      <div className="flex items-center gap-4">
        <ContributorAvatar
          emoji={contributor.avatar_emoji}
          displayName={contributor.display_name}
          className="h-16 w-16 text-2xl"
        />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {contributor.display_name}
          </h1>
          <p className="text-sm text-foreground/60">
            {t("storyCountPublished", { count: storyCount })}
            {from ? ` · ${t("fromCountry", { country: from })}` : ""}
          </p>
        </div>
      </div>

      {contributor.bio ? (
        <p className="mt-6 max-w-2xl text-foreground/70">{contributor.bio}</p>
      ) : null}

      <dl className="mt-6 max-w-2xl space-y-2">
        {/* The VALUES here stay as the database returned them: region
            names arrive from contributor_public_facts() without slugs (see
            lib/i18n/vocab.ts), and tags are the contributor's own words. */}
        <FactRow label={t("workedIn")} values={contributor.regions ?? []} />
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
        <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {stories.map((story) => (
            <StoryCard key={story.story_id} story={story} />
          ))}
        </div>
      </div>
    </div>
  );
}
