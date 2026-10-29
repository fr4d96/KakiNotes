import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { isCountrySlug } from "@/lib/story/countries";
import { StartNewStory } from "./start-new-story";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("newStory");
  return { title: t("metaTitle") };
}

// Never statically generated: StartNewStory always creates a real draft the
// moment this route is actually visited, so nothing here should be cached
// or pre-rendered.
export const dynamic = "force-dynamic";

export default async function NewStoryPage({
  searchParams,
}: {
  searchParams: Promise<{ country?: string }>;
}) {
  const { country } = await searchParams;
  // ?country= is how a link under /cn sends a contributor here already
  // knowing which country they mean (set by whatever "Start a new story"
  // entry point lives in that section) -- validated against COUNTRY_SLUGS
  // rather than passed through, so a hand-typed/garbage value just falls
  // back to no default instead of reaching createDraftAction with
  // something it would have to reject anyway.
  const defaultCountrySlug =
    country && isCountrySlug(country) ? country : undefined;
  return <StartNewStory defaultCountrySlug={defaultCountrySlug} />;
}
