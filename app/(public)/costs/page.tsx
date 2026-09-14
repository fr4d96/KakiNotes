import type { Metadata } from "next";
import Link from "next/link";
import { unstable_cache } from "next/cache";
import { useTranslations } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { createPublicClient } from "@/lib/supabase/public";
import { formatNzdCents } from "@/lib/story/expense-per-month";
import { prefixedVocabName, vocabName } from "@/lib/i18n/vocab";
import type { Locale } from "@/i18n/locales";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("costs");
  return { title: t("metaTitle"), description: t("metaDescription") };
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

const getAggregates = unstable_cache(
  async () => {
    const supabase = createPublicClient();
    const { data, error } = await supabase.rpc("get_expense_aggregates");
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
}: {
  band: NonNullable<Band>;
  unit: "overallUnit" | "perMonthUnit";
  locale: Locale;
}) {
  const t = useTranslations("costs");
  return (
    <>
      <p className="mt-2">
        <span className="text-3xl font-semibold">
          {formatNzdCents(band.median_cents, locale)}
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
          lowValue: formatNzdCents(band.p25_cents, locale),
          highValue: formatNzdCents(band.p75_cents, locale),
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
}: {
  rows: NamedBand[];
  locale: Locale;
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
              {formatNzdCents(row.median_cents, locale)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export default async function CostsPage() {
  const [{ overall, perMonth, byRegion, byCategory }, t, locale] =
    await Promise.all([getAggregates(), getTranslations("costs"), getLocale()]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>

      {/* The framing comes BEFORE any number, deliberately -- a reader who
          sees a figure first has already formed an expectation by the time
          they reach the caveat. */}
      <p className="mt-4 text-foreground/80">{t("framing")}</p>

      <section aria-labelledby="costs-overall" className="mt-10">
        <h2 id="costs-overall" className="text-xl font-semibold tracking-tight">
          {t("overallHeading")}
        </h2>
        {overall ? (
          <BandFigure band={overall} unit="overallUnit" locale={locale} />
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
          <BandFigure band={perMonth} unit="perMonthUnit" locale={locale} />
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
          <NamedBandList rows={byRegion} locale={locale} />
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
          <NamedBandList rows={byCategory} locale={locale} />
        ) : (
          <NotEnoughYet what="categories" />
        )}
      </section>

      <p className="mt-12 border-t border-border-subtle pt-6 text-sm text-foreground/60">
        {t("footerBefore")}{" "}
        <Link href="/stories" className="underline underline-offset-2">
          {t("footerLink")}
        </Link>{" "}
        {t("footerAfter")}
      </p>
    </div>
  );
}
