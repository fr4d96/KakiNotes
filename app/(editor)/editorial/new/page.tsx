import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { listContributorsForEditorial } from "@/lib/story/editorial-queries";
import { listActiveCountries } from "@/lib/story/active-lookups";
import { NewImportForm } from "./new-import-form";

export const metadata: Metadata = {
  title: "New Editorial Import",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function NewEditorialImportPage() {
  const [contributors, countries, locale] = await Promise.all([
    listContributorsForEditorial(),
    listActiveCountries(),
    getLocale(),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        New Editorial Import
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Start a founding-catalogue import for an existing or new contributor
        record. You&apos;ll add the story content, images, and attribution
        details on the next page.
      </p>
      <NewImportForm
        contributors={contributors}
        countries={countries}
        locale={locale}
      />
    </div>
  );
}
