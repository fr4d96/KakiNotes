import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { StartNewStory } from "./start-new-story";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("newStory");
  return { title: t("metaTitle") };
}

// Never statically generated: StartNewStory always creates a real draft the
// moment this route is actually visited, so nothing here should be cached
// or pre-rendered.
export const dynamic = "force-dynamic";

export default function NewStoryPage() {
  return <StartNewStory />;
}
