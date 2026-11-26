import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { StoriesIndex, type SearchParams } from "../../_shared/stories-index";

// Same "no revalidate export" reasoning as /stories/page.tsx -- this route
// awaits searchParams too.

export async function generateMetadata(): Promise<Metadata> {
  const [t, tCountry] = await Promise.all([
    getTranslations("stories"),
    getTranslations("countryContent"),
  ]);
  return {
    title: t("metaTitle"),
    description: tCountry("malaysia.storiesMetaDescription"),
  };
}

export default async function MalaysiaStoriesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return <StoriesIndex country="malaysia" searchParams={searchParams} />;
}
