/**
 * DIRECTION CONTRACT -- "Night Field" home, app-style (2026-10-31)
 *
 * THESIS: the home screen of an iOS-first PWA, not a long landing page. A
 *   reader should see real stories within one screen and reach any story in
 *   one or two taps. The previous "archive index" build ran ~7.5 phone
 *   screens and ~720 words and showed the same small batch of stories three
 *   ways (lit points, a drag stack, a filtered/paginated index) -- the
 *   Stories tab already owns full browsing, so the home page now only
 *   points into it.
 * KEPT: the Night Field world (near-black ground, one cyan accent, heavy
 *   sans, mono for record fields), the mounted hero PLATE with its point
 *   field (components/home/hero-field.tsx), the NZ | China switch at the top
 *   of the plate, the destination quiz, and the closing contribute band.
 * STRUCTURE: compact hero with search -> "Latest stories" swipe row ->
 *   "Browse by place" photo tiles (each opens /stories filtered) -> three
 *   one-line trust points -> the quiz, collapsed behind one row -> one
 *   contribute CTA. About three phone screens.
 * COPY: every section is a heading plus at most one short line. No section
 *   needs written instructions to be operated.
 *
 * (Recorded as a source comment, not an HTML comment in the rendered page,
 * since this is a multi-route Next.js app rather than a single static
 * artifact -- grep this file, not the built output.)
 */
import Link from "next/link";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import {
  listPublicRegions,
  listPublishedStoriesCached,
} from "@/lib/story/public-queries";
import { getCardCoverUrl } from "@/lib/story/image-url";
import { HeroField, type HeroRecord } from "@/components/home/hero-field";
import { StoryShelf } from "@/components/home/story-shelf";
import { PlaceTiles, type PlaceTile } from "@/components/home/place-tiles";
import { DestinationQuiz } from "@/components/home/destination-quiz";
import { firstRegionLabel, stringList } from "@/lib/story/card-fields";
import type { Locale } from "@/i18n/locales";
import {
  ArrowRightIcon,
  CheckCircleIcon,
  ChevronIcon,
  StorySearchIcon,
} from "@/components/icons";
import { CountryToggle } from "@/components/country-toggle";

// No `export const revalidate` any more (it was 60). The root layout reads
// the language cookie, which makes this route render per request, so the
// page-level window became a no-op; the same 60s window now lives on the
// data reads (the *Cached readers in lib/story/public-queries.ts).

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("home");
  return { title: t("metaTitle") };
}

// Message keys under `home.trust`, in reading order.
const trustPoints = ["written", "checked", "notAdvice"] as const;

const MAX_SHELF = 8;
const MAX_PLACES = 6;

/** One heading size for every section on the page -- an app screen, not a
 *  poster, so section heads stay at card scale rather than display scale. */
function SectionHeading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2
      id={id}
      className="text-2xl leading-tight font-extrabold tracking-[-.025em] text-balance sm:text-3xl"
    >
      {children}
    </h2>
  );
}

export default async function HomePage() {
  const [stories, regions, t, rawLocale] = await Promise.all([
    listPublishedStoriesCached({
      limit: 24,
      countrySlug: "new-zealand",
    }).catch(() => []),
    listPublicRegions("new-zealand").catch(() => []),
    getTranslations("home"),
    getLocale(),
  ]);
  const locale = rawLocale as Locale;
  const hasStories = stories.length > 0;

  // The field's points: one per published story, carrying only the fields
  // that story actually has (a missing one is omitted, never a dash), in
  // the reader's language.
  const heroRecords: HeroRecord[] = stories.map((story) => ({
    slug: story.slug,
    title: story.title,
    record: [
      firstRegionLabel(story.regions, locale),
      stringList(story.tags)[0],
      story.trip_year ? String(story.trip_year) : null,
    ]
      .filter((value): value is string => Boolean(value))
      .join(" · "),
  }));

  // Places: only regions that the published batch actually contains, most
  // frequent first, each linked by id into the Stories tab's region filter.
  // Story rows carry the English region name, so that is the join key; the
  // label is localised from the region row itself. Stories arrive newest
  // first, so the first cover seen for a region is its newest.
  const regionByName = new Map(regions.map((region) => [region.name, region]));
  const placeStats = new Map<
    string,
    { count: number; coverUrl: string | null }
  >();
  for (const story of stories) {
    const names = new Set(
      (Array.isArray(story.regions) ? story.regions : [])
        .map((entry) => (entry as { region_name?: unknown }).region_name)
        .filter((name): name is string => typeof name === "string"),
    );
    for (const name of names) {
      const stat = placeStats.get(name) ?? { count: 0, coverUrl: null };
      stat.count += 1;
      stat.coverUrl ??= getCardCoverUrl(story);
      placeStats.set(name, stat);
    }
  }
  const places: PlaceTile[] = Array.from(placeStats.entries())
    .flatMap(([name, stat]) => {
      const region = regionByName.get(name);
      if (!region) return [];
      const label =
        locale === "zh-CN" && region.name_zh_cn
          ? region.name_zh_cn
          : region.name;
      return [{ id: region.id, name: label, ...stat }];
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, MAX_PLACES)
    .map(({ id, name, coverUrl }) => ({ id, name, coverUrl }));

  return (
    <div className="bg-background pb-4 text-foreground">
      {/* ---- Hero plate: who this is for, and a way straight in. ---- */}
      <section className="px-4 pt-4 sm:px-6 sm:pt-6 lg:px-8">
        <div className="nf-dark-band relative isolate mx-auto flex h-[54svh] max-h-[620px] min-h-[430px] w-full max-w-[1440px] overflow-hidden rounded-[20px] bg-[#020617] text-white shadow-2xl sm:rounded-[28px]">
          <HeroField records={heroRecords} listLabel={t("field.listLabel")} />
          <div className="relative flex w-full flex-col justify-between px-5 pt-5 pb-6 sm:px-10 sm:pt-8 sm:pb-9 lg:px-14">
            {/* NZ | China section switch (product decision 3): the first
                control a reader meets, plain links so it works without JS. */}
            <div className="nf-hero-pull">
              <CountryToggle current="new-zealand" />
            </div>
            <div className="max-w-3xl">
              <h1 className="nf-hero-pull font-sans text-[clamp(2.4rem,9vw,5.25rem)] leading-[0.95] font-extrabold tracking-[-.035em] text-balance text-white">
                {/* One rich message, not two keys joined in JSX: the
                    accented words sit at the END in English and at the
                    START in Chinese. Only the message file can express that. */}
                {t.rich("hero", {
                  accent: (chunks) => (
                    <span className="text-accent">{chunks}</span>
                  ),
                })}
              </h1>
              <p
                className="nf-hero-pull mt-3 max-w-[40ch] text-base text-white/80 sm:mt-4 sm:text-lg"
                style={{ animationDelay: "140ms" }}
              >
                {t("heroSub")}
              </p>
              {/* A plain GET form into the Stories tab's own `q` filter, so
                  search works with JavaScript disabled and lands on the one
                  page that owns filtering. text-base (16px) keeps iOS Safari
                  from zooming the page when the field takes focus. */}
              <form
                action="/stories"
                method="get"
                role="search"
                className="nf-hero-pull mt-5 flex max-w-xl items-center gap-2 rounded-full border border-white/20 bg-[#0b1222] p-1.5 pl-4 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/40 sm:mt-6"
                style={{ animationDelay: "260ms" }}
              >
                <StorySearchIcon
                  aria-hidden="true"
                  className="h-5 w-5 shrink-0 text-white/70"
                />
                <label htmlFor="home-search" className="sr-only">
                  {t("searchLabel")}
                </label>
                <input
                  id="home-search"
                  name="q"
                  type="search"
                  enterKeyHint="search"
                  autoComplete="off"
                  placeholder={t("searchPlaceholder")}
                  className="min-w-0 flex-1 bg-transparent py-2 text-base text-white placeholder:text-white/60 focus:outline-none"
                />
                <button
                  type="submit"
                  className="min-h-[42px] shrink-0 rounded-full bg-accent px-4 text-sm font-bold text-accent-foreground transition-opacity hover:opacity-90"
                >
                  {t("searchButton")}
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>

      {hasStories ? (
        <>
          {/* ---- Latest stories: real content inside the first screen. ---- */}
          <section
            aria-labelledby="latest-heading"
            className="mx-auto max-w-[1440px] px-4 pt-10 sm:px-6 sm:pt-14 lg:px-8"
          >
            <div className="mb-4 flex items-baseline justify-between gap-4">
              <SectionHeading id="latest-heading">
                {t("latestHeading")}
              </SectionHeading>
              <Link
                href="/stories"
                className="inline-flex min-h-[44px] shrink-0 items-center gap-1 text-sm font-bold text-accent hover:underline"
              >
                {t("seeAll")} <ArrowRightIcon className="h-4 w-4" />
              </Link>
            </div>
            <StoryShelf stories={stories.slice(0, MAX_SHELF)} locale={locale} />
          </section>

          {/* ---- Browse by place: one tap into a filtered Stories tab. ---- */}
          {places.length > 0 ? (
            <section
              aria-labelledby="places-heading"
              className="mx-auto max-w-[1440px] px-4 pt-10 sm:px-6 sm:pt-14 lg:px-8"
            >
              <div className="mb-4">
                <SectionHeading id="places-heading">
                  {t("placesHeading")}
                </SectionHeading>
              </div>
              <PlaceTiles places={places} />
            </section>
          ) : null}
        </>
      ) : null}

      {/* ---- Trust: three one-line points, not three paragraphs. ---- */}
      <section
        id="how"
        aria-labelledby="trust-heading"
        className="mx-auto max-w-[1440px] scroll-mt-24 px-4 pt-12 sm:px-6 sm:pt-16 lg:px-8"
      >
        <SectionHeading id="trust-heading">{t("trustHeading")}</SectionHeading>
        <ul className="mt-4 grid gap-3 sm:grid-cols-3 sm:gap-6">
          {trustPoints.map((key) => (
            <li key={key} className="flex items-start gap-3">
              <CheckCircleIcon
                aria-hidden="true"
                className="mt-0.5 h-5 w-5 shrink-0 text-accent"
              />
              <span className="text-base font-bold">{t(`trust.${key}`)}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ---- Quiz: one row until the reader asks for it. A native
          <details> is the progressive disclosure -- keyboard-operable and
          announced as expandable with no client code. The quiz renders its
          own card, so the summary row and the quiz sit as siblings, never
          one card inside another. ---- */}
      {hasStories ? (
        <section
          id="match"
          aria-label={t("quizHeading")}
          className="mx-auto max-w-[1440px] scroll-mt-24 px-4 pt-12 sm:px-6 sm:pt-16 lg:px-8"
        >
          <details className="group/quiz">
            <summary className="press press-hover-only flex min-h-[72px] cursor-pointer list-none items-center justify-between gap-4 rounded-[20px] border border-border-subtle bg-surface px-5 py-4 shadow-sm transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none [&::-webkit-details-marker]:hidden">
              <span className="min-w-0">
                <span className="block text-lg leading-tight font-extrabold tracking-[-.02em]">
                  {t("quizHeading")}
                </span>
                <span className="mt-1 block text-sm text-foreground/70">
                  {t("quizDescription")}
                </span>
              </span>
              <ChevronIcon
                aria-hidden="true"
                className="h-5 w-5 shrink-0 rotate-90 text-accent transition-transform group-open/quiz:-rotate-90"
              />
            </summary>
            <div className="mt-3">
              <DestinationQuiz />
            </div>
          </details>
        </section>
      ) : null}

      {/* ---- Contribute: one CTA. The band closes on the same field the
          page opened on, with no points: the empty field a new story would
          be added to. `relative isolate overflow-hidden` is what HeroField's
          -z-10 canvas needs to sit behind this section's text. ---- */}
      <section className="px-4 pt-12 sm:px-6 sm:pt-16 lg:px-8">
        <div
          id="share"
          className="nf-dark-band journiq-share relative isolate mx-auto max-w-[1440px] scroll-mt-24 overflow-hidden rounded-[20px] px-5 py-9 text-white sm:rounded-[28px] sm:px-10 sm:py-12 lg:px-14"
        >
          <HeroField records={[]} scrim="band" />
          <div className="relative max-w-2xl">
            <h2 className="text-[1.75rem] leading-[1.05] font-extrabold tracking-[-.03em] text-balance text-white sm:text-4xl">
              {t("shareHeading")}
            </h2>
            <p className="mt-3 text-white/75">{t("shareBody")}</p>
            <Link href="/sign-up" className="night-button-primary mt-6">
              {t("shareCta")} <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
