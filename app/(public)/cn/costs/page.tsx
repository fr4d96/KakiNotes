import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

/**
 * China's costs page, deliberately simpler than ../../costs/page.tsx for
 * now: get_expense_aggregates() is a single global aggregate across every
 * published story regardless of country, and `total_expense_nzd_cents` is
 * NZD-denominated throughout the schema -- mixing it into a page framed as
 * "what people spent in China" would be actively misleading (reporting
 * NZ-trip medians under a China heading), and a real fix needs a
 * country-aware aggregate RPC plus a currency decision that's out of scope
 * for this pass. Tracked in docs/implementation-status.md as a follow-up.
 * Until then, this page keeps the same section structure and the exact
 * "not enough published stories yet" honesty the NZ page uses, rather than
 * showing numbers that aren't actually about China trips.
 */

export async function generateMetadata(): Promise<Metadata> {
  const [t, tCountry] = await Promise.all([
    getTranslations("costs"),
    getTranslations("countryContent"),
  ]);
  return {
    title: t("title"),
    description: tCountry("china.costsFraming"),
  };
}

export default async function ChinaCostsPage() {
  const [t, tCountry] = await Promise.all([
    getTranslations("costs"),
    getTranslations("countryContent"),
  ]);

  const sections: Array<{
    id: string;
    heading: string;
    note?: string;
    what: "total" | "perMonth" | "regions" | "categories";
  }> = [
    { id: "overall", heading: t("overallHeading"), what: "total" },
    {
      id: "per-month",
      heading: t("perMonthHeading"),
      note: t("perMonthNote"),
      what: "perMonth",
    },
    { id: "by-region", heading: t("byRegionHeading"), what: "regions" },
    { id: "by-category", heading: t("byCategoryHeading"), what: "categories" },
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>

      <p className="mt-4 text-foreground/80">
        {tCountry("china.costsFraming")}
      </p>

      {sections.map((section) => (
        <section
          key={section.id}
          aria-labelledby={`costs-${section.id}`}
          className="mt-10"
        >
          <h2
            id={`costs-${section.id}`}
            className="text-xl font-semibold tracking-tight"
          >
            {section.heading}
          </h2>
          {section.note ? (
            <p className="mt-1 text-sm text-foreground/60">{section.note}</p>
          ) : null}
          <p className="mt-2 text-sm text-foreground/60">
            {t("notEnough", { what: t(`notEnoughWhat.${section.what}`) })}
          </p>
        </section>
      ))}

      <p className="mt-12 border-t border-border-subtle pt-6 text-sm text-foreground/60">
        {t("footerBefore")}{" "}
        <Link href="/cn/stories" className="underline underline-offset-2">
          {t("footerLink")}
        </Link>{" "}
        {t("footerAfter")}
      </p>
    </div>
  );
}
