import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getMyJourney } from "@/lib/story/journey-queries";
import { JourneyView } from "./journey-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("myJourney");
  return { title: t("metaTitle") };
}

/**
 * Contributor-only (gated by app/(contributor)/layout.tsx, same as every
 * other route in this group). Loads the caller's own stories and their
 * current pin once per visit via get_my_journey() -- owner-scoped RPC, never
 * trusts anything from the client -- and hands them to the client component
 * that lists them (grouped like story folders), edits a pin's place and
 * previews the resulting map. A pin is public immediately, no review (the
 * same documented exception as story folders, docs/content-governance.md).
 */
export default async function MyJourneyPage() {
  const stories = await getMyJourney();
  return <JourneyView stories={stories} />;
}
