import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import { COUNTRY_COOKIE, newStoryCountry } from "@/lib/story/countries";
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
  // knowing which country they mean; every other "New story" link (avatar
  // menu, My Stories) relies on the header's remembered country instead.
  // Both are validated against COUNTRY_SLUGS, so a hand-typed/garbage value
  // just falls back to no default instead of reaching createDraftAction.
  const defaultCountrySlug = newStoryCountry(
    country,
    (await cookies()).get(COUNTRY_COOKIE)?.value,
  );
  return <StartNewStory defaultCountrySlug={defaultCountrySlug} />;
}
