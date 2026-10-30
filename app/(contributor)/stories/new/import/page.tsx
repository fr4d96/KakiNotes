import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { DEFAULT_COUNTRY_SLUG, isCountrySlug } from "@/lib/story/countries";
import { BackLink } from "@/components/back-link";
import { PdfImportPicker } from "../pdf-import-picker";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pdfImport");
  return { title: t("metaTitle") };
}

export const dynamic = "force-dynamic";

/**
 * Contributor-facing entry point for the PDF import flow — the same
 * feature editors already have at /editorial/new (see
 * app/(editor)/editorial/new/pdf-import-picker.tsx), now available to any
 * signed-in contributor for their own story rather than staff-only.
 * Kept as a separate route from /stories/new, which is the blank-story
 * path: both now ask for a title before anything is created, and each one
 * links across to the other, so a contributor who lands on the wrong one
 * is a single click from the right one.
 */
export default async function NewStoryImportPage({
  searchParams,
}: {
  searchParams: Promise<{ country?: string }>;
}) {
  const t = await getTranslations("pdfImport");
  const { country } = await searchParams;
  // Same `?country=` contract as /stories/new (page.tsx) -- validated
  // against COUNTRY_SLUGS rather than passed through. Unlike the blank-draft
  // path this always resolves to a concrete slug (DEFAULT_COUNTRY_SLUG when
  // absent/invalid) since PdfImportPicker sends it as a plain required form
  // field, not an optional hidden one.
  const countrySlug =
    country && isCountrySlug(country) ? country : DEFAULT_COUNTRY_SLUG;
  return (
    <div className="mx-auto max-w-3xl px-4 pt-4 pb-12 sm:px-6 sm:py-16">
      <div className="flex items-center gap-3">
        <BackLink />
        <h1 className="text-2xl font-semibold tracking-tight max-md:sr-only sm:text-3xl">
          {t("title")}
        </h1>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        {t("intro")}{" "}
        <Link href="/stories/new" className="underline underline-offset-2">
          {t("blankInstead")}
        </Link>
        .
      </p>
      <PdfImportPicker countrySlug={countrySlug} />
    </div>
  );
}
