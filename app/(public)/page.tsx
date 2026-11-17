/**
 * DIRECTION CONTRACT -- "Photo-first", Instagram/Pinterest-like (2026-11-17)
 *
 * THESIS: the stories' own photos lead, in the photo-first app language the
 *   audience lives in (owner's pinned reference: Instagram / Pinterest), on
 *   comfortable grounds in both themes. Refuses the themed costume (dots,
 *   night field, crate labels) and the one-big-scenic-photo travel hero.
 * OWN-WORLD: soft warm-gray ground (#f2f0ec light / #1c1a18 dark, never
 *   stark white or pure black), cards a step lighter, one Kingfisher-blue accent
 *   (#0068a3 / #3fb6f2), Figtree throughout, rounded-2xl photos, pill
 *   controls, no boxes around story cards.
 * STORY: a traveller sees real places from real accounts at once, finds one
 *   by place or search, and taps straight into a story.
 * FIRST VIEWPORT: headline + sub + search pill on top (phone) / left (lg);
 *   a drifting wall of story photos below / right, pause button on the wall;
 *   place tiles next, then latest stories as pins.
 * FORM: the category standard by owner choice (two re-rolls, then a named
 *   reference); direction seeds 1de9bdde, 77f00f74.
 * FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
 *
 * (A source comment, not an HTML comment in the rendered page: this is a
 * multi-route Next.js app and React does not emit comments -- grep here.)
 */
import { SignedOutOnly } from "@/components/auth/signed-out-only";
import { CardSizeSwitch } from "@/components/story/card-size-switch";
import { StoryCard } from "@/components/story/story-card";
import {
  CARD_SIZE_COOKIE,
  cardSizeFromCookieValue,
} from "@/lib/story/card-size";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  listCardPhotoUrlsCached,
  listPublicRegions,
  listPublishedStoriesCached,
} from "@/lib/story/public-queries";
import { getCardCoverUrl } from "@/lib/story/image-url";
import { PhotoWall, type WallTile } from "@/components/home/photo-wall";
import { StoryShelf } from "@/components/home/story-shelf";
import { PlaceTiles, type PlaceTile } from "@/components/home/place-tiles";
import { cardPhotoSrc } from "@/lib/story/card-photo-size";
import { DestinationQuiz } from "@/components/home/destination-quiz";
import { firstRegionLabel } from "@/lib/story/card-fields";
import type { Locale } from "@/i18n/locales";
import {
  ArrowRightIcon,
  CheckCircleIcon,
  ChevronIcon,
  StorySearchIcon,
} from "@/components/icons";
import { CountryPicker } from "@/components/country-picker";
import { COUNTRY_COOKIE, countryFromCookieValue } from "@/lib/story/countries";

// No `export const revalidate` any more (it was 60). The root layout reads
// the language cookie, which makes this route render per request, so the
// page-level window became a no-op; the same 60s window now lives on the
// data reads (the *Cached readers in lib/story/public-queries.ts).

// The home tab shows the bare brand name. `absolute` skips the root layout's
// "%s | Kakinotes" template, which would otherwise read "Kakinotes | Kakinotes".
export const metadata: Metadata = {
  title: { absolute: "Kakinotes" },
};

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
  // The reader's country, remembered on this device by POST /country. China
  // opens China's home; no choice yet shows the first-visit picker over
  // this page (still rendered underneath, for crawlers).
  const remembered = countryFromCookieValue(
    (await cookies()).get(COUNTRY_COOKIE)?.value,
  );
  if (remembered === "china") redirect("/cn");
  // Big or small cards for "Latest stories" -- the same per-device choice
  // as the Stories tab (lib/story/card-size.ts; small unless chosen).
  const cardSize = cardSizeFromCookieValue(
    (await cookies()).get(CARD_SIZE_COOKIE)?.value,
  );
  const needsCountryPicker = remembered === null;

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

  // Each "Latest stories" card swipes through its published photos. One
  // cached read per card, all at once; a card whose read fails just falls
  // back to its cover.
  const shelfStories = stories.slice(0, MAX_SHELF);
  const shelfPhotos: Record<string, string[]> = Object.fromEntries(
    await Promise.all(
      shelfStories.map(async (story) => [
        story.slug,
        await listCardPhotoUrlsCached(story.story_id).catch(() => []),
      ]),
    ),
  );

  // The hero's photo wall: each story with a cover, newest first, as one
  // tile (the /media proxy's 640px card version when it is a Drive photo).
  const wallTiles: WallTile[] = stories.flatMap((story) => {
    const cover = getCardCoverUrl(story);
    if (!cover) return [];
    return [
      {
        slug: story.slug,
        title: story.title,
        place: firstRegionLabel(story.regions, locale) ?? "",
        url: cardPhotoSrc(cover, 640),
      },
    ];
  });

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
      {needsCountryPicker ? <CountryPicker /> : null}
      {/* ---- Hero: who this is for, a way straight in, and a living wall
          of the stories' own photos (PhotoWall). Phone: words, then the
          wall. From lg: words left, wall right. ---- */}
      <section className="mx-auto grid max-w-[1440px] gap-6 px-4 pt-6 sm:px-6 sm:pt-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-center lg:gap-12 lg:px-8 lg:pt-12">
        <div className="max-w-xl">
          <h1 className="text-[clamp(2.3rem,8.5vw,4.25rem)] leading-[1.02] font-extrabold tracking-[-.03em] text-balance">
            {/* One rich message, not two keys joined in JSX: the accented
                words sit at the END in English and at the START in
                Chinese. Only the message file can express that. */}
            {t.rich("hero", {
              accent: (chunks) => <span className="text-accent">{chunks}</span>,
            })}
          </h1>
          <p className="mt-3 max-w-[40ch] text-base text-muted-foreground sm:mt-4 sm:text-lg">
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
            className="mt-5 flex max-w-xl items-center gap-2 rounded-full bg-surface p-1.5 pl-4 shadow-md focus-within:ring-2 focus-within:ring-accent/50 sm:mt-6"
          >
            <StorySearchIcon
              aria-hidden="true"
              className="h-5 w-5 shrink-0 text-muted-foreground"
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
              className="min-w-0 flex-1 bg-transparent py-2 text-base text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            <button
              type="submit"
              className="press min-h-[42px] shrink-0 rounded-full bg-accent px-5 text-sm font-bold text-accent-foreground transition-opacity hover:opacity-90"
            >
              {t("searchButton")}
            </button>
          </form>
        </div>
        {wallTiles.length > 0 ? (
          <div className="-mx-4 h-[400px] sm:mx-0 sm:h-[460px] lg:h-[600px]">
            <PhotoWall
              tiles={wallTiles}
              pauseLabel={t("field.pause")}
              playLabel={t("field.play")}
            />
          </div>
        ) : null}
      </section>

      {hasStories ? (
        <>
          {/* ---- Browse by place: a row of small rounded photos under the
              hero, each opening the Stories tab filtered to that place. ---- */}
          {places.length > 0 ? (
            <section
              aria-labelledby="places-heading"
              className="mx-auto max-w-[1440px] px-4 pt-8 sm:px-6 sm:pt-12 lg:px-8"
            >
              <div className="mb-3">
                <SectionHeading id="places-heading">
                  {t("placesHeading")}
                </SectionHeading>
              </div>
              <PlaceTiles places={places} />
            </section>
          ) : null}

          {/* ---- Latest stories: real content inside the first screen. ---- */}
          <section
            aria-labelledby="latest-heading"
            className="mx-auto max-w-[1440px] px-4 pt-10 sm:px-6 sm:pt-14 lg:px-8"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <SectionHeading id="latest-heading">
                {t("latestHeading")}
              </SectionHeading>
              <div className="flex shrink-0 items-center gap-2">
                <CardSizeSwitch size={cardSize} />
                <Link
                  href="/stories"
                  className="inline-flex min-h-[44px] shrink-0 items-center gap-1 text-sm font-bold text-accent hover:underline"
                >
                  {t("seeAll")} <ArrowRightIcon className="h-4 w-4" />
                </Link>
              </div>
            </div>
            {/* Small: a two-per-row grid, the Stories tab's compact card.
                Big: the wide swipe row. */}
            {cardSize === "small" ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
                {shelfStories.map((story) => (
                  <StoryCard
                    key={story.story_id}
                    story={story}
                    photos={shelfPhotos[story.slug]}
                    size="small"
                  />
                ))}
              </div>
            ) : (
              <StoryShelf
                stories={shelfStories}
                photos={shelfPhotos}
                locale={locale}
              />
            )}
          </section>
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

      {/* ---- Contribute: one CTA, on a soft accent-tinted panel -- a
          sign-up pitch, so visitors only: once the browser confirms a
          session the panel is removed (SignedOutOnly; owner request
          2026-11-17). It sits at the end of the page, so that moment is
          never on screen. ---- */}
      <SignedOutOnly>
        <section className="px-4 pt-12 sm:px-6 sm:pt-16 lg:px-8">
          <div
            id="share"
            className="mx-auto flex max-w-[1440px] scroll-mt-24 flex-col items-start gap-5 rounded-3xl bg-tag-background px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-10 sm:py-10"
          >
            <div className="max-w-2xl">
              <h2 className="text-[1.6rem] leading-[1.08] font-extrabold tracking-[-.025em] text-balance sm:text-3xl">
                {t("shareHeading")}
              </h2>
              <p className="mt-2 text-muted-foreground">{t("shareBody")}</p>
            </div>
            <Link
              href="/sign-up"
              className="press inline-flex min-h-[46px] shrink-0 items-center gap-2 rounded-full bg-accent px-5 text-sm font-bold text-accent-foreground transition-opacity hover:opacity-90"
            >
              {t("shareCta")} <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </SignedOutOnly>
    </div>
  );
}
