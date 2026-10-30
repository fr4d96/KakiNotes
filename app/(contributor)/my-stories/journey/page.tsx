import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getMyJourney } from "@/lib/story/journey-queries";
import { JourneyListView } from "./journey-list";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("myJourney");
  return { title: t("metaTitle") };
}

/**
 * Contributor-only (gated by app/(contributor)/layout.tsx, same as every
 * other route in this group). Loads the caller's own stories and their
 * current pin once per visit via get_my_journey() -- owner-scoped RPC, never
 * trusts anything from the client -- and lists their published journeys
 * (journey-list.tsx); each opens its own page, ./[storyId], where pins are
 * edited. A pin is public immediately, no review (the same documented
 * exception as story folders, docs/content-governance.md).
 */
export default async function MyJourneyPage() {
  const stories = await getMyJourney();
  return <JourneyListView stories={stories} />;
}
