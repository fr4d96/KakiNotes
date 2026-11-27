import type { ReactNode } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ChevronIcon } from "@/components/icons";
import { ExpenseDonut, resolveSlices } from "@/components/story/expense-donut";
import { ExpenseScopeSwitch } from "@/components/story/expense-scope-switch";
import { isLocale } from "@/i18n/locales";
import { formatMoneyCents } from "@/lib/i18n/format";
import { DEFAULT_CURRENCY } from "@/lib/story/currency";
import { expensePerMonth, formatMonths } from "@/lib/story/expense-per-month";
import type { CombinedFamilyExpenses } from "@/lib/story/family-expenses";

/**
 * What one trip cost, on the public story page.
 *
 * Replaces the single "Traveller-reported cost: NZ$X" line that was the only
 * thing a reader could see about money. The breakdown has been enterable
 * since 20260902110100 and readable from get_published_story() since
 * 20260903120000; this is the first surface that shows it.
 *
 * A SERVER COMPONENT, deliberately. Nothing here is interactive (the one
 * exception, the This story | Total Trip Cost switch on a main story, is
 * a small client island that only shows one of two server-rendered panels),
 * and both pieces it leans on were built without React state or a Supabase import for
 * exactly this reason: `expensePerMonth()` is arithmetic and `ExpenseDonut`
 * is arc maths, so the public page reuses them unchanged rather than growing
 * a second implementation that could disagree with the editor's.
 *
 * ENGINEERING RULE 17 IS THE WHOLE FRAME. This is the part of a story a
 * reader is most likely to mistake for advice -- a number is easy to read as
 * "this is the budget" in a way prose is not. So the heading says whose
 * money it was, the per-month line says what it is derived from, and the
 * closing line says plainly that it is one person's record and not an
 * estimate for anyone else. None of that is decoration; it is the same
 * commitment the personal-experience label makes, applied where it is
 * easiest to forget.
 */

export type PublicExpense = {
  name: string;
  amount_nzd_cents: number;
  note: string | null;
};

export function PublicExpenses({
  totalCents,
  tripStartDate,
  tripEndDate,
  expenses,
  currency = DEFAULT_CURRENCY,
  combined = null,
  basePath = "/stories",
}: {
  totalCents: number | null;
  tripStartDate: string | null;
  tripEndDate: string | null;
  expenses: PublicExpense[];
  /** ISO 4217 code of the published revision's amounts. */
  currency?: string;
  /**
   * A main story's costs added to its published sub stories'
   * (lib/story/family-expenses.ts). When present, a switch offers
   * "This story" and "Total Trip Cost"; the story's own figures stay the
   * default view. null hides the switch.
   */
  combined?: CombinedFamilyExpenses | null;
  /** Where the per-story links point -- see StoryCard's basePath. */
  basePath?: string;
}) {
  const t = useTranslations("story.expenses");
  const breakdown = expenses.filter((e) => e.amount_nzd_cents > 0);

  // Nothing recorded: render nothing at all rather than an empty section
  // announcing an absence. Most stories will not have this. (A main story
  // with no costs of its own but costly sub stories still shows: there is
  // something to switch to.)
  if (totalCents == null && breakdown.length === 0 && !combined) return null;

  const ownEmpty = totalCents == null && breakdown.length === 0;
  const own = ownEmpty ? (
    <p className="mt-3 text-sm text-foreground/60">{t("noOwnCosts")}</p>
  ) : (
    <ExpenseFigures
      totalCents={totalCents}
      totalCaption={t("reportedForWholeTrip")}
      tripStartDate={tripStartDate}
      tripEndDate={tripEndDate}
      expenses={breakdown}
      currency={currency}
    />
  );

  return (
    <section
      id="costs"
      aria-labelledby="story-expenses-heading"
      className="mt-10 scroll-mt-18 border-t border-border-subtle pt-6"
    >
      <h2
        id="story-expenses-heading"
        className="text-xl font-semibold tracking-tight"
      >
        {t("heading")}
      </h2>

      {combined ? (
        <ExpenseScopeSwitch
          // A main story with no costs of its own opens on the combined
          // view, so the reader isn't met by an empty panel.
          initialScope={ownEmpty ? "family" : "story"}
          thisStory={own}
          withSubStories={
            <>
              <ExpenseFigures
                totalCents={combined.totalCents}
                totalCaption={t("reportedAcrossStories", {
                  count: combined.perStory.length,
                })}
                tripStartDate={combined.tripStartDate}
                tripEndDate={combined.tripEndDate}
                expenses={combined.expenses}
                currency={currency}
                more={
                  <PerStoryTotals
                    combined={combined}
                    currency={currency}
                    basePath={basePath}
                  />
                }
              />
              {combined.skippedOtherCurrency > 0 && (
                <p className="mt-2 text-xs text-foreground/60">
                  {t("skippedOtherCurrency", {
                    count: combined.skippedOtherCurrency,
                  })}
                </p>
              )}
            </>
          }
        />
      ) : (
        own
      )}

      <p className="mt-6 text-xs text-foreground/60">{t("disclaimer")}</p>
    </section>
  );
}

/** Headline total, per-month line and donut -- one view's worth. */
function ExpenseFigures({
  totalCents,
  totalCaption,
  tripStartDate,
  tripEndDate,
  expenses,
  currency,
  more,
}: {
  totalCents: number | null;
  totalCaption: string;
  tripStartDate: string | null;
  tripEndDate: string | null;
  expenses: PublicExpense[];
  currency: string;
  /** Shown inside "See full breakdown", after the donut. */
  more?: ReactNode;
}) {
  const t = useTranslations("story.expenses");
  const tDonut = useTranslations("expenses.donut");
  const rawLocale = useLocale();
  const locale = isLocale(rawLocale) ? rawLocale : "en";

  const perMonth = expensePerMonth({
    startDate: tripStartDate,
    endDate: tripEndDate,
    totalCents,
  });

  // The note is the contributor's own gloss on a category ("Other" is the
  // common case). Folding it into the label keeps it beside the figure it
  // explains, and needs no change to the donut the editor also uses.
  const slices = expenses
    .filter((e) => e.amount_nzd_cents > 0)
    .map((e) => ({
      label: e.note ? `${e.name} — ${e.note}` : e.name,
      cents: e.amount_nzd_cents,
    }));
  const resolved = resolveSlices(slices, tDonut("smallerCategories"));

  return (
    <>
      {totalCents != null && (
        <p className="mt-2">
          <span className="text-2xl font-semibold">
            {formatMoneyCents(totalCents, currency, locale)}
          </span>{" "}
          <span className="text-sm text-foreground/60">{totalCaption}</span>
        </p>
      )}

      {/* Derived from the trip dates above, never stored. Silent when the
          trip has no date range, or is too short for a monthly figure to
          describe anything real -- see lib/story/expense-per-month.ts, which
          would rather show nothing than a confident extrapolation. */}
      {perMonth.kind === "ok" && (
        <p className="mt-1 text-sm text-foreground/60">
          {/* t.rich, not string concatenation: Chinese puts the amount and
              the month count in a different order, and only the message
              file can express that. */}
          {t.rich("perMonth", {
            amountValue: formatMoneyCents(
              perMonth.perMonthCents,
              currency,
              locale,
            ),
            months: formatMonths(perMonth.months),
            amount: (chunks) => (
              <strong className="font-medium text-foreground">{chunks}</strong>
            ),
          })}
        </p>
      )}

      {/* At a glance: one slim bar in the donut's own colours and order
          (resolveSlices, so the two can never disagree), and the three
          biggest categories in words. The ring, its full legend and any
          per-story list wait behind "See full breakdown" -- a native
          <details>, so it opens without JavaScript and the page stays
          short until the reader asks for more. */}
      {resolved.slices.length > 0 && (
        <>
          <div
            aria-hidden="true"
            className="mt-4 flex h-2.5 gap-0.5 overflow-hidden rounded-full"
          >
            {resolved.slices.map((slice) => (
              <span
                key={slice.label}
                className="h-full min-w-1"
                style={{
                  flexGrow: slice.share,
                  flexBasis: 0,
                  backgroundColor: slice.color,
                }}
              />
            ))}
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
            {resolved.slices.slice(0, 3).map((slice) => (
              <li
                key={slice.label}
                className="inline-flex items-center gap-1.5"
              >
                <span
                  aria-hidden="true"
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: slice.color }}
                />
                <span className="max-w-40 truncate">{slice.label}</span>
                <span className="tabular-nums">{formatShare(slice.share)}</span>
              </li>
            ))}
          </ul>

          <details className="group mt-2">
            <summary className="press inline-flex min-h-11 cursor-pointer list-none items-center gap-1 text-sm font-semibold text-accent [&::-webkit-details-marker]:hidden">
              <span className="group-open:hidden">{t("seeBreakdown")}</span>
              <span className="hidden group-open:inline">
                {t("hideBreakdown")}
              </span>
              <ChevronIcon className="h-4 w-4 transition-transform duration-200 group-open:rotate-90 motion-reduce:transition-none" />
            </summary>
            {/* `beside`, not the editor's stacked default: there is no list
                of inputs here for the ring to sit next to. */}
            <div className="mt-3">
              <ExpenseDonut rows={slices} layout="beside" currency={currency} />
            </div>
            {more}
          </details>
        </>
      )}
      {resolved.slices.length === 0 && more}
    </>
  );
}

/** 12% -> "12%", never a bare "0%" for something that is really there. */
function formatShare(share: number): string {
  const percent = share * 100;
  if (percent > 0 && percent < 1) return "<1%";
  return `${Math.round(percent)}%`;
}

/**
 * Which story each part of the combined total came from, main story first.
 * Sub story titles link to their own page, where their own breakdown is.
 */
function PerStoryTotals({
  combined,
  currency,
  basePath,
}: {
  combined: CombinedFamilyExpenses;
  currency: string;
  basePath: string;
}) {
  const t = useTranslations("story.expenses");
  const rawLocale = useLocale();
  const locale = isLocale(rawLocale) ? rawLocale : "en";
  return (
    <div className="mt-6">
      <h3 className="text-sm font-medium text-foreground/60">
        {t("perStoryHeading")}
      </h3>
      <ul className="mt-2 divide-y divide-border-subtle text-sm">
        {combined.perStory.map((s) => (
          <li key={s.slug} className="flex items-baseline gap-3 py-2">
            <span className="min-w-0 flex-1">
              {s.isMain ? (
                s.title
              ) : (
                <Link
                  href={`${basePath}/${s.slug}`}
                  className="text-accent underline underline-offset-2"
                >
                  {s.title}
                </Link>
              )}
            </span>
            <span className="shrink-0 tabular-nums">
              {formatMoneyCents(s.totalCents, currency, locale)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
