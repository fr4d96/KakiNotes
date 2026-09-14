import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { listMyStoriesWithCovers } from "@/lib/story/contributor-queries";
import { listMyTakedownRequests } from "@/lib/story/mutations";
import { MyStoriesView } from "./my-stories-view";
import { SubmissionToast } from "./submission-toast";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("myStories");
  return { title: t("metaTitle") };
}

export default async function MyStoriesPage() {
  const stories = await listMyStoriesWithCovers();
  // One batch call, not one per row -- see 20260903100100's own note about
  // not reintroducing the N+1 this page had removed.
  const takedowns = await listMyTakedownRequests();

  return (
    <>
      <Suspense fallback={null}>
        <SubmissionToast />
      </Suspense>
      <MyStoriesView stories={stories} takedownRequests={takedowns} />
    </>
  );
}
