import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getMyJourney } from "@/lib/story/journey-queries";
import { groupMyJourney } from "@/lib/journey/contributor-journey";
import { JourneyStoryView } from "../journey-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("myJourney");
  return { title: t("metaTitle") };
}

/**
 * One journey: a published main story and its published sub stories, with
 * their map and pins (journey-view.tsx). The id in the URL is only used to
 * PICK a journey from the caller's own list -- get_my_journey() is
 * owner-scoped, so another contributor's story id (or a draft's, or a sub
 * story's) finds nothing here and 404s (Engineering Rule 2). Saving a pin
 * goes through setStoryJourneyPlaceAction, which re-checks everything.
 */
export default async function MyJourneyStoryPage({
  params,
}: {
  params: Promise<{ storyId: string }>;
}) {
  const { storyId } = await params;
  const stories = await getMyJourney();
  const group = groupMyJourney(stories).find((g) => g.main.id === storyId);
  if (!group) notFound();
  return <JourneyStoryView main={group.main} subs={group.subs} />;
}
