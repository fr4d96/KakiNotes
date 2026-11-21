import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import {
  getPublishedStoryBySlugDeduped,
  listCardPhotoUrlsCached,
  getPublishedStoryMediaDeduped,
  getPublicContributorDeduped,
  coverOf,
  listPublishedStories,
} from "@/lib/story/public-queries";
import { getImageUrl } from "@/lib/story/image-url";
import { imageBlockMediaIds } from "@/lib/validation/story";
import { normalizeStoryContentJson } from "@/lib/story/legacy-content";
import { prefixedVocabName, vocabName } from "@/lib/i18n/vocab";
import type { Locale } from "@/i18n/locales";
import {
  ContentBlockRenderer,
  type ContentBlockMediaMap,
} from "@/components/story/content-block-renderer";
import Link from "next/link";
import { getPublishedContributorJourney } from "@/lib/story/journey-queries";
import { StoryGallery } from "@/components/story/story-gallery";
import { PartOfStory, SubStoryList } from "@/components/story/story-family";
import {
  getPublishedStoryFamilyDeduped,
  matchStoryFamilyCards,
} from "@/lib/story/story-folders";
import { StoryCard } from "@/components/story/story-card";
import { AttributionChip } from "@/components/story/attribution-chip";
import { pickRelatedStories } from "@/lib/story/related-stories";
import { PersonalExperienceLabel } from "@/components/story/personal-experience-label";
import { ReportStoryForm } from "@/components/story/report-story-form";
import {
  PublicExpenses,
  type PublicExpense,
} from "@/components/story/public-expenses";
import { ShareStoryButton } from "@/components/story/share-story-button";
import { countryUrlPrefix, type CountrySlug } from "@/lib/story/countries";

// Shared by /stories/[id] (NZ) and /cn/stories/[id] (China), parameterized
// by `country` -- every data read below is scoped to it (Rule 10/12: a /cn
// reader must never reach an NZ story by slug, and vice versa;
// get_published_story()'s p_country_slug is what actually enforces that,
// not just this page not linking to it). See ../stories/page.tsx /
// ../cn/stories/page.tsx and the StoriesIndex shared component for the same
// pattern on the index route.
//
// No `export const revalidate` -- unchanged reasoning from before this
// split: this route never had a cacheable window (see the original
// comment history in git blame of app/(public)/stories/[id]/page.tsx).

/** Display labels ("destination, region"), in the visitor's language. */
function regionLabels(regions: unknown, locale: Locale): string[] {
  if (!Array.isArray(regions)) return [];
  return regions
    .map((entry) => {
      const region = prefixedVocabName(entry, "region", locale);
      if (!region) return null;
      const destination = prefixedVocabName(entry, "destination", locale);
      return destination ? `${destination}, ${region}` : region;
    })
    .filter((v): v is string => v !== null);
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

/**
 * The expense breakdown, name-localized. get_published_story() emits each
 * entry as `{name, name_zh_cn, amount_nzd_cents, note}` (Json), so this
 * narrows defensively -- a malformed entry is dropped rather than rendered
 * as "undefined". PublicExpenses only knows about the plain `name` field, so
 * the Chinese pick happens here, before the data reaches it.
 */
function localizedExpenses(expenses: unknown, locale: Locale): PublicExpense[] {
  if (!Array.isArray(expenses)) return [];
  return expenses
    .map((entry): PublicExpense | null => {
      if (!entry || typeof entry !== "object") return null;
      const row = entry as {
        name?: unknown;
        name_zh_cn?: unknown;
        amount_nzd_cents?: unknown;
        note?: unknown;
      };
      if (
        typeof row.name !== "string" ||
        typeof row.amount_nzd_cents !== "number"
      ) {
        return null;
      }
      return {
        name: vocabName(
          {
            name: row.name,
            name_zh_cn:
              typeof row.name_zh_cn === "string" ? row.name_zh_cn : null,
          },
          locale,
        ),
        amount_nzd_cents: row.amount_nzd_cents,
        note: typeof row.note === "string" ? row.note : null,
      };
    })
    .filter((e): e is PublicExpense => e !== null);
}

function jsonLdScript(value: unknown) {
  // Never string-concatenate JSON-LD -- build from a controlled object and
  // escape "<" so a value containing "</script>" can't break out of the
  // script tag. This is metadata output, not rendered story body content,
  // but the same "never trust raw injected strings" discipline as
  // Engineering Rule 7 applies.
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export async function generateStoryDetailMetadata(
  country: CountrySlug,
  slug: string,
): Promise<Metadata> {
  const story = await getPublishedStoryBySlugDeduped(slug, country);
  if (!story) return {};

  // coverOf(), not `.find(is_cover)`: a story whose contributor never opened
  // the per-photo Details panel had no cover at all, so it shipped no
  // og:image and shared as a bare text card. See that helper for the rule,
  // which the SQL readers now share.
  //
  // Only ever published media: getPublishedStoryMediaDeduped() wraps
  // get_published_story_media(), which is scoped to the story's
  // published_revision_id specifically (Rule 10) -- a draft/pending Drive
  // (or supabase) photo can never appear in this list regardless of
  // backend, so it can never end up in an og:image either.
  const ogCoverMedia = coverOf(
    await getPublishedStoryMediaDeduped(story.story_id),
  );
  const coverUrl = ogCoverMedia
    ? getImageUrl({
        id: ogCoverMedia.media_id,
        storage_backend: ogCoverMedia.storage_backend ?? "supabase",
        public_url: ogCoverMedia.public_url,
      })
    : null;

  return {
    title: story.title,
    description: story.excerpt ?? undefined,
    alternates: {
      canonical: `${countryUrlPrefix(country)}/stories/${story.slug}`,
    },
    robots: { index: true, follow: true },
    openGraph: {
      type: "article",
      url: `${countryUrlPrefix(country)}/stories/${story.slug}`,
      title: story.title,
      description: story.excerpt ?? undefined,
      publishedTime: story.published_at,
      images: coverUrl ? [{ url: coverUrl }] : undefined,
    },
    twitter: {
      card: coverUrl ? "summary_large_image" : "summary",
      title: story.title,
      description: story.excerpt ?? undefined,
      images: coverUrl ? [coverUrl] : undefined,
    },
  };
}

export async function StoryDetail({
  country,
  slug,
}: {
  country: CountrySlug;
  slug: string;
}) {
  const [story, t, tCommon, locale] = await Promise.all([
    getPublishedStoryBySlugDeduped(slug, country),
    getTranslations("story"),
    getTranslations("common"),
    getLocale(),
  ]);
  if (!story) notFound();

  const [media, family, profileContributor] = await Promise.all([
    getPublishedStoryMediaDeduped(story.story_id),
    getPublishedStoryFamilyDeduped(story.story_id),
    // The contributor's public profile, for the sub story cards and the
    // "See this on ... journey" link. The journey map is New Zealand only,
    // so other countries' story pages never ask for it.
    story.contributor_slug
      ? getPublicContributorDeduped(story.contributor_slug, country)
      : Promise.resolve(null),
  ]);

  // Is this story a pin on its contributor's journey? Public pins only
  // (Rules 10-12); [] when the RPC is unavailable, so the story itself
  // always renders.
  let journeyContributor: typeof profileContributor = null;
  if (country === "new-zealand" && profileContributor) {
    const pins = await getPublishedContributorJourney(
      profileContributor.contributor_id,
    );
    if (pins.some((pin) => pin.slug === story.slug)) {
      journeyContributor = profileContributor;
    }
  }

  // Sub stories as full cards. A sub story always has the same contributor
  // as its main story, so one page of that contributor's published cards
  // covers it -- uncached, like every read on this page. The family read
  // decides WHICH stories show; the cards only add display fields.
  const subStoryContributor =
    family.subStories.length > 0 ? profileContributor : null;
  const subStoryCards = matchStoryFamilyCards(
    family.subStories,
    subStoryContributor
      ? await listPublishedStories({
          countrySlug: country,
          contributorId: subStoryContributor.contributor_id,
          limit: 50,
        })
      : [],
  );
  const subStoryIds = new Set(subStoryCards.cards.map((s) => s.story_id));

  // Sub stories with no card row -- always the case when the contributor
  // has no public profile, which used to leave every sub story on the
  // placeholder image. Look each one up by slug through the same
  // published-only reader as this page (so a story that isn't public
  // resolves to nothing), then take its cover from its published photos.
  const unmatchedSubStories = await Promise.all(
    subStoryCards.unmatched.map(async (link) => {
      try {
        const sub = await getPublishedStoryBySlugDeduped(link.slug, country);
        const photos = sub ? await listCardPhotoUrlsCached(sub.story_id) : [];
        if (sub) subStoryIds.add(sub.story_id);
        return { ...link, coverUrl: photos[0] ?? null };
      } catch {
        return { ...link, coverUrl: null };
      }
    }),
  );

  // Related stories: the country's newest published stories, ranked by
  // shared places and tags (lib/story/related-stories.ts) -- the story
  // itself and its sub stories (already shown as cards above) are left out
  // before picking, so they never leave a gap. 50 is the list RPC's
  // ceiling; the catalogue is far smaller today, so every story is a
  // candidate. Uncached, like every read on this page.
  const relatedWithoutSubStories = pickRelatedStories(
    story,
    await listPublishedStories({
      countrySlug: country,
      excludeStoryId: story.story_id,
      limit: 50,
    }),
    { limit: 3, excludeIds: new Set([story.story_id, ...subStoryIds]) },
  );
  // Related cards swipe through their published photos, like every other
  // story card. One cached read per card; a failed read keeps the cover.
  const relatedPhotos = await Promise.all(
    relatedWithoutSubStories.map((s) =>
      listCardPhotoUrlsCached(s.story_id).catch(() => [] as string[]),
    ),
  );

  const parsedContent = normalizeStoryContentJson(story.content_json);

  // Images placed inline (an "image" block referencing a mediaId) render
  // via ContentBlockRenderer's own media map; the trailing StoryGallery
  // only shows what's NOT already placed in the text, so nothing appears
  // twice (see components/story/content-block-renderer.tsx's
  // ContentBlockMediaMap comment and story-gallery.tsx's updated header).
  const inlineMediaIds = new Set(
    parsedContent ? imageBlockMediaIds(parsedContent) : [],
  );
  const contentMedia: ContentBlockMediaMap = {};
  for (const m of media) {
    const url = getImageUrl({
      id: m.media_id,
      storage_backend: m.storage_backend ?? "supabase",
      public_url: m.public_url,
    });
    if (url) {
      contentMedia[m.media_id] = {
        url,
        altText: m.alt_text,
        decorative: m.decorative,
      };
    }
  }
  const galleryMedia = media.filter((m) => !inlineMediaIds.has(m.media_id));

  const regions = regionLabels(story.regions, locale);

  // The share sheet's preview cover: the page's own published cover, resolved
  // exactly like the og:image in generateStoryDetailMetadata (published media
  // only -> getImageUrl(): the public bucket URL or the Drive proxy path,
  // never a signed or share link). null shows the placeholder.
  const shareCover = coverOf(media);
  const shareCoverUrl = shareCover
    ? getImageUrl({
        id: shareCover.media_id,
        storage_backend: shareCover.storage_backend ?? "supabase",
        public_url: shareCover.public_url,
      })
    : null;
  const tripLabel =
    story.trip_start_date && story.trip_end_date
      ? `${story.trip_start_date} – ${story.trip_end_date}`
      : story.trip_year
        ? String(story.trip_year)
        : null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: story.title,
    description: story.excerpt ?? undefined,
    datePublished: story.published_at,
    // Untranslated on purpose: JSON-LD is machine-readable metadata for
    // search engines, not page copy, and "Anonymous" is its stable value.
    author: { "@type": "Person", name: story.attribution_value ?? "Anonymous" },
  };

  return (
    // pt-4 on a phone, like the other app screens: the top bar already sits
    // above, and py-12 left a 48px gap before the breadcrumb.
    <div className="mx-auto max-w-5xl px-4 pt-4 pb-12 sm:px-6 sm:py-16">
      {/* Controlled JSON-LD only, see jsonLdScript() above -- never user content. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
      />

      <PartOfStory
        parent={family.parent}
        basePath={`${countryUrlPrefix(country)}/stories`}
      />

      <h1
        id="story-title"
        className="scroll-mt-20 text-3xl font-semibold tracking-tight sm:text-4xl"
      >
        {story.title}
      </h1>
      {story.excerpt ? (
        <p className="mt-3 text-lg text-foreground/70">{story.excerpt}</p>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-6">
        <AttributionChip
          name={story.attribution_value ?? tCommon("anonymous")}
          contributorSlug={story.contributor_slug}
          contributorBasePath={`${countryUrlPrefix(country)}/contributors`}
          avatarEmoji={story.contributor_avatar_emoji}
          tripYear={tripLabel ? undefined : story.trip_year}
          destination={regions[0] ?? null}
        />
        {tripLabel ? (
          <span className="text-sm text-foreground/60">
            {t("trip", { range: tripLabel })}
          </span>
        ) : null}
        <div className="sm:ml-auto">
          <ShareStoryButton
            title={story.title}
            subtitle={[
              story.attribution_value ?? tCommon("anonymous"),
              regions[0],
            ]
              .filter(Boolean)
              .join(" · ")}
            path={`${countryUrlPrefix(country)}/stories/${story.slug}`}
            coverUrl={shareCoverUrl}
          />
        </div>
      </div>

      {(regions.length > 0 || stringList(story.tags).length > 0) && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {Array.from(new Set([...regions, ...stringList(story.tags)])).map(
            (label) => (
              <span
                key={label}
                className="rounded-full bg-tag-background px-2 py-0.5 text-xs text-tag-foreground"
              >
                {label}
              </span>
            ),
          )}
        </div>
      )}

      <div className="mt-8">
        {parsedContent ? (
          <ContentBlockRenderer blocks={parsedContent} media={contentMedia} />
        ) : (
          <p className="text-destructive">{t("contentUnavailable")}</p>
        )}
      </div>

      {journeyContributor ? (
        <p className="mt-8">
          <Link
            href={`/contributors/${journeyContributor.public_slug}/journey`}
            className="inline-flex min-h-[44px] items-center text-sm font-medium text-accent underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {t("seeOnJourney", { name: journeyContributor.display_name })}
          </Link>
        </p>
      ) : null}

      {galleryMedia.length > 0 ? (
        <div className="mt-10">
          <StoryGallery images={galleryMedia} />
        </div>
      ) : null}

      <PublicExpenses
        totalCents={story.total_expense_nzd_cents}
        tripStartDate={story.trip_start_date}
        tripEndDate={story.trip_end_date}
        expenses={localizedExpenses(story.expenses, locale)}
      />

      <SubStoryList
        cards={subStoryCards.cards}
        subStories={unmatchedSubStories}
        basePath={`${countryUrlPrefix(country)}/stories`}
      />

      {/* Engineering Rule 17's "personal experience, not advice" label, at
          the end of the story (owner decision 2026-11-15): the top of the
          page starts with the title, and the label is read where a reader
          finishes, right above the Report option. */}
      {/* The label and Report sit together as the story's closing note
          (2026-11-18: they used to be split by a hairline, with 40 / 48 /
          64px gaps around them that read as empty screen on a phone). The
          hairline now marks where the story ends and Related begins. */}
      <div className="mt-8 flex flex-col items-start gap-1">
        <PersonalExperienceLabel countrySlug={country} />
        <ReportStoryForm storyId={story.story_id} storySlug={story.slug} />
      </div>

      {relatedWithoutSubStories.length > 0 ? (
        <div className="mt-6 border-t border-border-subtle pt-8">
          <h2 className="text-xl font-semibold tracking-tight">
            {t("relatedStories")}
          </h2>
          {/* Small cards, two to a row on a phone (the Stories tab's
              compact size): a glance at what's next, not a second feed of
              full-width photos (2026-11-18). */}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
            {relatedWithoutSubStories.map((s, index) => (
              <StoryCard
                key={s.story_id}
                size="small"
                story={s}
                basePath={`${countryUrlPrefix(country)}/stories`}
                photos={relatedPhotos[index]}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
