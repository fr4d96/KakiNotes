import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { listPublishedStories } from "@/lib/story/public-queries";
import { StoryCard } from "@/components/story/story-card";
import { CountryToggle } from "@/components/country-toggle";
import { PersonalExperienceLabel } from "@/components/story/personal-experience-label";
import { ArrowRightIcon } from "@/components/icons";

/**
 * China's landing page. Deliberately NOT a reuse of the NZ home page's
 * "Night Field" art direction (app/(public)/page.tsx's hero-field/
 * destination-quiz components carry a lot of WHV- and
 * NZ-specific prose and visual direction baked into their own design
 * contract) -- a straightforward, real, mobile-first page instead, built
 * from the same generic building blocks the rest of the app already uses
 * (StoryCard, CountryToggle, PersonalExperienceLabel). It still has to do
 * everything a landing page must: say what this section is, prove there's a
 * real catalogue, and get a reader into it.
 *
 * `listPublishedStories({ countrySlug: "china" })` is what keeps this page
 * from ever showing an NZ story -- see Rule 10/12 and the shared
 * StoriesIndex / StoryDetail components' header comments for the same
 * country-filter discipline.
 */

export async function generateMetadata(): Promise<Metadata> {
  const tCountry = await getTranslations("countryContent");
  return {
    title: tCountry("china.tagline"),
    description: tCountry("china.siteDescription"),
  };
}

export default async function ChinaHomePage() {
  const [stories, t, tCountry] = await Promise.all([
    listPublishedStories({ countrySlug: "china", limit: 12 }).catch(() => []),
    getTranslations("home"),
    getTranslations("countryContent"),
  ]);
  const hasStories = stories.length > 0;

  return (
    <div className="bg-background text-foreground">
      <section className="mx-auto max-w-[1440px] px-4 pt-10 pb-6 sm:px-6 sm:pt-14 lg:px-8">
        <CountryToggle current="china" />

        <h1 className="mt-6 text-[clamp(2.25rem,6vw,4.5rem)] leading-[1.02] font-extrabold tracking-[-.03em] text-balance">
          {tCountry("china.tagline")}
        </h1>
        <p className="mt-4 max-w-[60ch] text-base text-foreground/70 sm:text-lg">
          {tCountry("china.siteDescription")}
        </p>

        <div className="mt-6">
          <PersonalExperienceLabel countrySlug="china" />
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
          <Link
            href="/cn/stories"
            className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground hover:opacity-90"
          >
            {t("heroCta")} <ArrowRightIcon className="h-4 w-4" />
          </Link>
          <Link
            href="/sign-up"
            className="inline-flex items-center gap-2 rounded-full border border-border-subtle px-5 py-2.5 text-sm font-semibold hover:bg-surface-muted"
          >
            {t("shareCta")}
          </Link>
        </div>
      </section>

      {hasStories ? (
        <section className="border-t border-border-subtle bg-surface py-12 sm:py-16">
          <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {t("recordHeading")}
            </h2>
            <p className="mt-2 max-w-2xl text-foreground/70">
              {tCountry("china.storiesIntro")}
            </p>
            <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {stories.map((story) => (
                <StoryCard
                  key={story.story_id}
                  story={story}
                  basePath="/cn/stories"
                />
              ))}
            </div>
            <div className="mt-10">
              <Link
                href="/cn/stories"
                className="rounded-md border border-border-subtle px-4 py-2 text-sm font-medium hover:bg-surface-muted"
              >
                {t("heroCta")}
              </Link>
            </div>
          </div>
        </section>
      ) : (
        <section className="border-t border-border-subtle py-16 text-center">
          <p className="mx-auto max-w-md text-foreground/60">
            {tCountry("china.storiesIntro")}
          </p>
        </section>
      )}
    </div>
  );
}
