import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { StoriesIndex, type SearchParams } from "../_shared/stories-index";

// No `export const revalidate` here on purpose. This route awaits
// `searchParams` (the filter state), which forces dynamic rendering in the App
// Router -- confirmed in the production build output, where /stories is
// `ƒ (Dynamic) server-rendered on demand` with no revalidate period. (Since
// the language cookie, 2026-09-14, every route is `ƒ`; the difference now is
// that `/` caches its data for a minute and this page deliberately does not,
// so a filter result is always fresh.) A `revalidate` export here would be a
// silent no-op, so don't re-add one. Making this page genuinely cacheable
// would mean moving the filtering client-side, which is a separate, larger
// piece of work.

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("stories");
  return { title: t("metaTitle"), description: t("metaDescription") };
}

export default async function StoriesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return <StoriesIndex country="new-zealand" searchParams={searchParams} />;
}
