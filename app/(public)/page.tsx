/**
 * DIRECTION CONTRACT -- "Night Field" (landing page)
 * World seed da6ac2c2 (user-pinned; supersedes that roll's assignment).
 * Structure seed 494761b9 (--scope surface --mode persuade), assigned
 * candidate 7 of the grounded list: the archive index.
 *
 * THESIS: a documentary archive's front door, not a travel product's --
 *   the page's spine is a real catalogue index whose columns are fields the
 *   stories actually carry, so the record itself is the proof. It refuses
 *   the category default of three photo-card grids showing the same stories
 *   three different ways.
 * OWN-WORLD: near-black ground (#020617), raised dark surfaces (#0b1222),
 *   one cyan accent (#35d0c4) held for state and emphasis; heavy sans for
 *   display, Geist Mono for every numeral, column label, and index field.
 *   No serif, no terracotta, no kicker labels, no glyph icons.
 * STORY: cinematic first viewport establishes the place, a short featured
 *   lead shows what a story looks like, the index proves there is a real
 *   body of them and lets the reader narrow by place and work, the model is
 *   explained, and the page closes on one contribute CTA.
 * FIRST VIEWPORT: an inset PLATE (rounded, elevated, inside the page
 *   gutter -- not full-bleed; see The Mounted Plate Rule in DESIGN.md) that
 *   is the night field itself: a lattice of faint points the pointer bends
 *   like a lens, with every published story lit in it as a point you can
 *   hover, tap or tab to (components/home/hero-field.tsx). No photography
 *   -- the plate is made of the record. Bottom-left headline with one cyan
 *   word, ghost-outline primary CTA plus a quiet text link. The header sits
 *   solid above it rather than dissolving into it.
 * FORM: archive index. The Night Field palette this page introduced is now
 *   the app-wide token set (app/globals.css), so this page no longer scopes
 *   its own. Motion is one authored idea (a lens focus pull) expressed in
 *   CSS scroll timelines, never JS observers; see app/globals.css.
 * FINISH: unreviewed and undocumented is unfinished; this build ends with
 *   the finish review, the verdict, and DESIGN.md.
 *
 * (Recorded as a source comment, not an HTML comment in the rendered page,
 * since this is a multi-route Next.js app rather than a single static
 * artifact -- grep this file, not the built output.)
 */
import Link from "next/link";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { listPublishedStoriesCached } from "@/lib/story/public-queries";
import { HeroField, type HeroRecord } from "@/components/home/hero-field";
import { FeaturedStoryStack } from "@/components/home/featured-story-stack";
import { StoryIndex } from "@/components/home/story-index";
import { DestinationQuiz } from "@/components/home/destination-quiz";
import {
  firstRegionLabel,
  regionNames,
  stringList,
} from "@/lib/story/card-fields";
import type { Locale } from "@/i18n/locales";
import { ArrowRightIcon } from "@/components/icons";

// No `export const revalidate` any more (it was 60). The root layout reads
// the language cookie, which makes this route render per request, so the
// page-level window became a no-op; the same 60s window now lives on the
// data reads (the *Cached readers in lib/story/public-queries.ts).

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("home");
  return { title: t("metaTitle") };
}

// Message-key pairs; the prose lives in messages/<locale>.json under
// `home.steps`.
const steps = [
  ["writtenTitle", "writtenBody"],
  ["checkedTitle", "checkedBody"],
  ["recordTitle", "recordBody"],
] as const;

function SectionHead({
  title,
  description,
  className = "",
}: {
  title: string;
  description?: string;
  className?: string;
}) {
  // `nf-focus` (the blur half of the focus pull) is deliberately ONLY here:
  // a section head is a small, text-only block, so blurring it on the
  // compositor is cheap. The larger wrappers below use plain `nf-pull`
  // (rise + fade); see the "where the blur is allowed to run" note in
  // app/globals.css.
  return (
    <div
      className={`nf-pull nf-focus grid gap-4 md:grid-cols-[1fr_420px] md:items-end md:gap-8 ${className}`}
    >
      <h2 className="night-heading">{title}</h2>
      {description ? (
        <p className="text-base text-foreground/65 sm:text-lg">{description}</p>
      ) : null}
    </div>
  );
}

export default async function HomePage() {
  const [stories, t, rawLocale] = await Promise.all([
    listPublishedStoriesCached({ limit: 24 }).catch(() => []),
    getTranslations("home"),
    getLocale(),
  ]);
  const locale = rawLocale as Locale;
  const hasStories = stories.length > 0;

  // The field's points: one per published story, carrying only the fields
  // that story actually has (a missing one is omitted, never a dash), in
  // the reader's language. Same three fields as an index row, so the hero
  // and the index agree about what a record looks like.
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

  // Distinct regions actually present in the published catalogue, in order of
  // how many stories carry them, capped so the rail stays one calm line
  // rather than a wall. Derived from the same rows the index below renders --
  // never a hardcoded list of nice-sounding place names, which would go stale
  // the moment the catalogue changed and would be a claim rather than a fact.
  const regionCounts = new Map<string, number>();
  for (const story of stories) {
    for (const name of new Set(regionNames(story.regions, locale))) {
      regionCounts.set(name, (regionCounts.get(name) ?? 0) + 1);
    }
  }
  const heroRegions = Array.from(regionCounts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 7)
    .map(([name]) => name);

  return (
    <div className="bg-background text-foreground">
      {/* Reading progress. Pure CSS scroll timeline -- no listener, no
          re-render. Sits directly under the sticky 76px header. */}
      <div
        aria-hidden="true"
        className="nf-progress pointer-events-none fixed inset-x-0 top-[76px] z-40 h-px"
      >
        <span className="block h-full w-full bg-accent" />
      </div>

      {/*
        The hero is an inset PLATE, not a full-bleed band.

        It used to run edge-to-edge with a `-mt-[76px]` tucking it behind a
        transparent header. That reads as cinema in the dark rendition, but in
        light mode it put a ~900px near-black slab hard against warm off-white
        paper -- a slab from a different design, not a page. Mounting the photo
        inside the page gutter with the palette's own radius and elevation makes
        it read as a photograph ON the page in both renditions, which is also
        truer to the archive thesis: an archive shows you a mounted plate.

        `overflow-hidden` + `isolate` keep the field's canvas and its story
        points clipped to the rounded box. svh rather than vh so a mobile URL
        bar collapsing does not resize the hero mid-scroll; clamped so it
        stays cinematic on a short phone and does not become a canyon on a
        tall desktop.
      */}
      <section className="px-4 pt-5 sm:px-6 sm:pt-6 lg:px-8">
        <div className="nf-dark-band relative isolate mx-auto flex h-[74svh] max-h-[780px] min-h-[520px] w-full max-w-[1440px] overflow-hidden rounded-[20px] bg-[#020617] text-white shadow-2xl sm:rounded-[28px]">
          <HeroField records={heroRecords} listLabel={t("field.listLabel")} />
          <div className="relative flex w-full flex-col justify-end px-6 pb-7 sm:px-10 sm:pb-9 lg:px-14">
            <div className="max-w-3xl">
              {/* Display caps at 6rem. The previous 6.8rem broke the world's
                  own ceiling and, on a 1440px viewport, pushed the second
                  line hard against the CTA row with no air between them. */}
              <h1 className="nf-hero-pull font-sans text-[clamp(2.5rem,7vw,6rem)] leading-[0.94] font-extrabold tracking-[-.035em] text-balance text-white">
                {/* One rich message, not two keys joined in JSX: the
                    accented words sit at the END in English and at the
                    START in Chinese, and the punctuation differs too (a
                    Latin "." with a space before the span, a full-width
                    "。" with none). Only the message file can express that. */}
                {t.rich("hero", {
                  accent: (chunks) => (
                    <span className="text-accent">{chunks}</span>
                  ),
                })}
              </h1>
              <p
                className="nf-hero-pull mt-5 max-w-[46ch] text-base text-white/80 sm:mt-6 sm:text-lg"
                style={{ animationDelay: "140ms" }}
              >
                {t("heroSub")}
              </p>
              <div
                className="nf-hero-pull mt-7 flex flex-wrap items-center gap-x-6 gap-y-4 sm:mt-8"
                style={{ animationDelay: "260ms" }}
              >
                <Link href="#index" className="night-button-primary">
                  {t("heroCta")} <ArrowRightIcon className="h-4 w-4" />
                </Link>
                <Link href="#how" className="night-button-ghost">
                  {t("heroSecondary")}
                </Link>
              </div>
            </div>

            {/*
              The catalogue rail: the places this archive actually holds,
              read off the published rows themselves. Not a stat badge and
              not social proof (PRODUCT.md bans both) -- it is the index
              speaking in the first viewport, which is the whole thesis of
              the page. It renders only when there is something true to put
              in it, so an empty catalogue shows nothing rather than a
              hedge.
            */}
            {heroRegions.length > 0 ? (
              <div
                className="nf-hero-pull mt-10 border-t border-white/15 pt-4 sm:mt-14"
                style={{ animationDelay: "380ms" }}
              >
                <ul className="nf-scroll-x -mx-6 flex items-center gap-x-6 overflow-x-auto px-6 sm:mx-0 sm:flex-wrap sm:gap-x-7 sm:gap-y-2 sm:px-0">
                  {heroRegions.map((region) => (
                    <li
                      key={region}
                      className="font-mono text-[0.68rem] tracking-[0.2em] whitespace-nowrap text-white/55 uppercase"
                    >
                      {region}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {hasStories ? (
        <>
          {/* The featured lead: a publication's front-page story, ahead of
              the full record below it. */}
          <section className="py-16 sm:py-24 lg:py-28">
            <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8">
              <SectionHead
                title={t("featuredHeading")}
                description={t("featuredDescription")}
              />
              {/* The stack's depth cards sit 14px to the side of the top
                  card and rotate up to 2deg, and a thrown card flies to
                  ±118% before it finishes fading -- all of which reached
                  past the viewport at 375px and gave the whole landing page
                  a horizontal scrollbar.

                  `overflow-x: clip`, not `hidden`: hidden on one axis forces
                  the other to `auto`, which would make this a scroll
                  container and can surface a stray vertical scrollbar for
                  the cards' own shadows. `clip` clips without ever becoming
                  scrollable.

                  The negative margins with matching padding put the clip
                  boundary at the container's edge rather than the card's, so
                  the card box is exactly the size it was and its shadow
                  still has room to fall to the side. */}
              <div className="nf-pull -mx-4 mt-8 overflow-x-clip px-4 sm:-mx-6 sm:mt-10 sm:px-6 lg:-mx-8 lg:px-8">
                <FeaturedStoryStack stories={stories.slice(0, 5)} />
              </div>
            </div>
          </section>

          {/* The index: the page's spine and its only browse surface. */}
          <section
            id="index"
            className="scroll-mt-24 border-t border-border-subtle bg-surface py-16 sm:py-24 lg:py-28"
          >
            <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8">
              <SectionHead
                title={t("recordHeading")}
                description={t("recordDescription")}
              />
              <div className="mt-8 sm:mt-12">
                <StoryIndex stories={stories} />
              </div>
            </div>
          </section>
        </>
      ) : null}

      <section id="how" className="scroll-mt-24 py-16 sm:py-24 lg:py-28">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8">
          <SectionHead
            title={t("trustHeading")}
            description={t("trustDescription")}
          />
          {/*
            Three statements, set as an editorial rhythm rather than three
            equal cards. The card grid this replaces was the category's
            default page scaffold -- icon/heading/text boxes side by side --
            and it made three claims about trust look like three product
            features. Rules and generous leading let each statement land on
            its own, which is what a record says about itself. Also cheaper:
            no borders, no shadows, no hover lift to maintain.
          */}
          <dl className="mt-10 md:mt-16">
            {steps.map(([titleKey, bodyKey]) => (
              <div
                key={titleKey}
                className="grid gap-x-10 gap-y-3 border-t border-border-subtle py-8 first:border-t-0 first:pt-0 sm:py-10 md:grid-cols-[minmax(0,7fr)_minmax(0,9fr)]"
              >
                <dt className="text-2xl leading-[1.15] font-extrabold tracking-[-.025em] text-balance sm:text-[1.75rem]">
                  {t(`steps.${titleKey}`)}
                </dt>
                <dd className="max-w-[62ch] text-base text-foreground/65 sm:text-lg">
                  {t(`steps.${bodyKey}`)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {hasStories ? (
        <section
          id="match"
          className="scroll-mt-24 border-t border-border-subtle py-16 sm:py-24 lg:py-28"
        >
          <div className="mx-auto grid max-w-[1440px] gap-10 px-4 sm:px-6 lg:grid-cols-[.8fr_1.2fr] lg:gap-16 lg:px-8">
            <div className="nf-pull lg:sticky lg:top-28 lg:self-start">
              <h2 className="night-heading">{t("quizHeading")}</h2>
              <p className="mt-5 max-w-xl text-foreground/65">
                {t("quizDescription")}
              </p>
            </div>
            {/* No panel chrome here. DestinationQuiz renders its own bordered,
                rounded card, so wrapping it in a second one produced a card
                inside a card -- two concentric rounded borders with nothing
                between them but padding, which reads as a rendering mistake
                rather than a design. The quiz keeps its own frame; this
                wrapper now only positions it. */}
            <div className="nf-pull">
              <DestinationQuiz />
            </div>
          </div>
        </section>
      ) : null}

      {/* The page closes on the same field it opened on, with no points:
          the empty field a new story would be added to. `relative isolate
          overflow-hidden` is what HeroField's -z-10 canvas needs to sit
          behind this section's text rather than behind the page. */}
      <section
        id="share"
        className="nf-dark-band journiq-share relative isolate scroll-mt-24 overflow-hidden py-16 text-white sm:py-24 lg:py-28"
      >
        <HeroField records={[]} scrim="band" />
        <div className="relative mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8">
          <div className="nf-pull max-w-3xl">
            <h2 className="night-heading text-white">{t("shareHeading")}</h2>
            <p className="mt-5 max-w-2xl text-white/75">{t("shareBody")}</p>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
              <Link href="/sign-up" className="night-button-primary">
                {t("shareCta")} <ArrowRightIcon className="h-4 w-4" />
              </Link>
              <Link href="/about" className="night-button-ghost">
                {t("shareSecondary")}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
