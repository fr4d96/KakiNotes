import type { Metadata } from "next";
import Link from "next/link";
import { unstable_cache } from "next/cache";
import { useTranslations } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { createPublicClient } from "@/lib/supabase/public";
import { formatMoneyCents } from "@/lib/i18n/format";
import { countryCurrency } from "@/lib/story/country-currency";
import {
  countryMessageSegment,
  countryUrlPrefix,
  type CountrySlug,
} from "@/lib/story/countries";
import { prefixedVocabName, vocabName } from "@/lib/i18n/vocab";
import type { Locale } from "@/i18n/locales";

/**
 * New Zealand's title and framing are the WHV-worded `costs.*`; any other
 * country with a real costs page (Malaysia) uses its own
 * countryContent.<segment>.costsTitle / costsFraming -- never WHV wording.
 */
export async function generateCostsMetadata(
  country: "new-zealand" | "malaysia",
): Promise<Metadata> {
  if (country === "new-zealand") {
    const t = await getTranslations("costs");
    return { title: t("metaTitle"), description: t("metaDescription") };
  }
  const tCountry = await getTranslations("countryContent");
  const segment = countryMessageSegment(country) as "malaysia";
  return {
    title: tCountry(`${segment}.costsTitle`),
    description: tCountry(`${segment}.costsFraming`),
  };
}

// Aggregated from published stories, which change when a story is published,
// edited or withdrawn. Short-TTL ISR rather than force-dynamic: this is
// expensive to compute, identical for every reader, and nobody is harmed by
// it being an hour stale.
// No `export const revalidate` any more (it was 3600). The root layout reads
// the language cookie, which makes this route render per request, so the
// page-level window became a no-op; the same hour now lives on the
// aggregate read below (unstable_cache), which is the expensive part.
// Deliberately NOT tagged for on-demand invalidation, matching the previous
// behaviour: these are medians across every published story, an hour stale
// was always acceptable, and no visibility change ever purged this page.

/**
 * "What it actually cost", across every published story.
 *
 * THE LINE THIS PAGE WALKS. docs/product-spec.md puts budgeting tools and
 * anything reading as personalised financial advice under MVP non-goals, and
 * Engineering Rule 17 makes every story a personal account. A page of money
 * figures is the easiest place on this site to cross that line by accident,
 * so it is written to report the PAST rather than predict a future: it asks
 * the reader nothing, it computes nothing about them, and every figure is
 * introduced by how many real people it came from.
 *
 * The distinction is not pedantry. "Half of the 40 people who recorded a cost
 * spent between X and Y" is a fact about those people. "You will need X" is
 * advice, and the difference is the whole reason this page is allowed to
 * exist at all.
 */

type Band = {
  story_count: number;
  median_cents: number;
  p25_cents: number;
  p75_cents: number;
} | null;

type NamedBand = {
  name?: string;
  name_zh_cn?: string | null;
  region_name?: string;
  region_name_zh_cn?: string | null;
  story_count: number;
  median_cents: number;
};

/**
 * by_region rows carry `region_name`/`region_name_zh_cn`; by_category rows
 * carry `name`/`name_zh_cn` (see get_expense_aggregates() shapes noted in
 * lib/i18n/vocab.ts). Whichever pair is present picks the visitor's
 * language; a row with neither renders an empty label rather than
 * "undefined".
 */
function namedBandLabel(row: NamedBand, locale: Locale): string {
  if (typeof row.region_name === "string") {
    return prefixedVocabName(row, "region", locale) ?? row.region_name;
  }
  if (typeof row.name === "string") {
    return vocabName({ name: row.name, name_zh_cn: row.name_zh_cn }, locale);
  }
  return "";
}

// One cache entry per country (the country is part of the key, so New
// Zealand's figures can never be served on Malaysia's page or the reverse).
// get_expense_aggregates(p_country_slug) only adds up amounts recorded in
// that country's own currency (20261126090000_malaysia.sql).
const getAggregates = unstable_cache(
  async (country: CountrySlug) => {
    const supabase = createPublicClient();
    const { data, error } = await supabase.rpc("get_expense_aggregates", {
      p_country_slug: country,
    });
    if (error) throw error;
    const row = data?.[0];
    return {
      overall: (row?.overall ?? null) as Band,
      perMonth: (row?.per_month ?? null) as Band,
      byRegion: ((row?.by_region ?? []) as unknown as NamedBand[]) ?? [],
      byCategory: ((row?.by_category ?? []) as unknown as NamedBand[]) ?? [],
    };
  },
  ["public:get_expense_aggregates"],
  { revalidate: 3600 },
);

/**
 * Says WHY a section is empty rather than hiding it. A missing section reads
 * as "we never thought about this"; this reads as "not enough people have
 * told us yet", which is both true and an invitation.
 */
function NotEnoughYet({
  what,
}: {
  what: "total" | "perMonth" | "regions" | "categories";
}) {
  const t = useTranslations("costs");
  return (
    <p className="mt-2 text-sm text-foreground/60">
      {t("notEnough", { what: t(`notEnoughWhat.${what}`) })}
    </p>
  );
}

function BandFigure({
  band,
  unit,
  locale,
  currency,
}: {
  band: NonNullable<Band>;
  unit: "overallUnit" | "perMonthUnit";
  locale: Locale;
  currency: string;
}) {
  const t = useTranslations("costs");
  return (
    <>
      <p className="mt-2">
        <span className="text-3xl font-semibold">
          {formatMoneyCents(band.median_cents, currency, locale)}
        </span>{" "}
        <span className="text-sm text-foreground/60">{t(unit)}</span>
      </p>
      <p className="mt-1 text-sm text-foreground/60">
        {/* One message, not three fragments joined in JSX: Chinese puts the
            count, the two figures and the verb in a different order. */}
        {/* The TAG and the VALUE cannot share a name: next-intl resolves
            `<low>` to a render function and `{lowValue}` to a string, and
            passing one `low` for both threw FORMATTING_ERROR, which rendered
            the raw message key on the page. Same tag/value split as
            components/story/public-expenses.tsx's `amount`/`amountValue`. */}
        {t.rich("halfReportedBetween", {
          count: band.story_count,
          lowValue: formatMoneyCents(band.p25_cents, currency, locale),
          highValue: formatMoneyCents(band.p75_cents, currency, locale),
          low: (chunks) => (
            <strong className="font-medium text-foreground">{chunks}</strong>
          ),
          high: (chunks) => (
            <strong className="font-medium text-foreground">{chunks}</strong>
          ),
        })}
      </p>
    </>
  );
}

function NamedBandList({
  rows,
  locale,
  currency,
}: {
  rows: NamedBand[];
  locale: Locale;
  currency: string;
}) {
  const t = useTranslations("costs");
  return (
    <ul className="mt-3 divide-y divide-border-subtle border-t border-border-subtle">
      {rows.map((row) => {
        const label = namedBandLabel(row, locale);
        return (
          <li
            key={label}
            className="flex items-baseline justify-between gap-4 py-2.5 text-sm"
          >
            <span className="min-w-0 flex-1 truncate">{label}</span>
            <span className="shrink-0 text-foreground/60">
              {t("storyCount", { count: row.story_count })}
            </span>
            <span className="shrink-0 tabular-nums font-medium">
              {formatMoneyCents(row.median_cents, currency, locale)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** One country's costs page: New Zealand's /costs and Malaysia's /my/costs. */
export async function CostsView({
  country,
}: {
  country: "new-zealand" | "malaysia";
}) {
  const [
    { overall, perMonth, byRegion, byCategory },
    t,
    tCountry,
    locale,
    currency,
  ] = await Promise.all([
    getAggregates(country),
    getTranslations("costs"),
    getTranslations("countryContent"),
    getLocale(),
    countryCurrency(country),
  ]);
  const isNewZealand = country === "new-zealand";
  // Only read when not New Zealand, i.e. Malaysia's own costs copy.
  const segment = countryMessageSegment(country) as "malaysia";

  return (
    <div className="mx-auto max-w-3xl px-4 pt-4 pb-10 sm:px-6 sm:pt-10">
      <h1 className="text-3xl font-semibold tracking-tight max-md:sr-only">
        {isNewZealand ? t("title") : tCountry(`${segment}.costsTitle`)}
      </h1>

      {/* The framing comes BEFORE any number, deliberately -- a reader who
          sees a figure first has already formed an expectation by the time
          they reach the caveat. */}
      <p className="mt-4 text-foreground/80">
        {isNewZealand ? t("framing") : tCountry(`${segment}.costsFraming`)}
      </p>

      <section aria-labelledby="costs-overall" className="mt-10">
        <h2 id="costs-overall" className="text-xl font-semibold tracking-tight">
          {t("overallHeading")}
        </h2>
        {overall ? (
          <BandFigure
            band={overall}
            unit="overallUnit"
            locale={locale}
            currency={currency}
          />
        ) : (
          <NotEnoughYet what="total" />
        )}
      </section>

      <section aria-labelledby="costs-per-month" className="mt-10">
        <h2
          id="costs-per-month"
          className="text-xl font-semibold tracking-tight"
        >
          {t("perMonthHeading")}
        </h2>
        <p className="mt-1 text-sm text-foreground/60">{t("perMonthNote")}</p>
        {perMonth ? (
          <BandFigure
            band={perMonth}
            unit="perMonthUnit"
            locale={locale}
            currency={currency}
          />
        ) : (
          <NotEnoughYet what="perMonth" />
        )}
      </section>

      <section aria-labelledby="costs-by-region" className="mt-10">
        <h2
          id="costs-by-region"
          className="text-xl font-semibold tracking-tight"
        >
          {t("byRegionHeading")}
        </h2>
        {/* Region and category names come from get_expense_aggregates() with
            a Simplified Chinese twin beside the English name; namedBandLabel
            above picks the visitor's language -- see lib/i18n/vocab.ts. */}
        {byRegion.length > 0 ? (
          <NamedBandList rows={byRegion} locale={locale} currency={currency} />
        ) : (
          <NotEnoughYet what="regions" />
        )}
      </section>

      <section aria-labelledby="costs-by-category" className="mt-10">
        <h2
          id="costs-by-category"
          className="text-xl font-semibold tracking-tight"
        >
          {t("byCategoryHeading")}
        </h2>
        {byCategory.length > 0 ? (
          <NamedBandList
            rows={byCategory}
            locale={locale}
            currency={currency}
          />
        ) : (
          <NotEnoughYet what="categories" />
        )}
      </section>

      <p className="mt-12 border-t border-border-subtle pt-6 text-sm text-foreground/60">
        {t("footerBefore")}{" "}
        <Link
          href={`${countryUrlPrefix(country)}/stories`}
          className="underline underline-offset-2"
        >
          {t("footerLink")}
        </Link>{" "}
        {t("footerAfter")}
      </p>
    </div>
  );
}
