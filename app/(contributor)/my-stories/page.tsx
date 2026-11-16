import { Suspense } from "react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { listMyStoriesWithCovers } from "@/lib/story/contributor-queries";
import { listMyTakedownRequests } from "@/lib/story/mutations";
import {
  COUNTRY_COOKIE,
  DEFAULT_COUNTRY_SLUG,
  countryFromCookieValue,
} from "@/lib/story/countries";
import { MyStoriesView } from "./my-stories-view";
import { SubmissionToast } from "./submission-toast";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("myStories");
  return { title: t("metaTitle") };
}

export default async function MyStoriesPage() {
  // Each country is its own section: My Stories shows only the stories of
  // the country chosen in the top bar (the kakinotes-country cookie, New
  // Zealand when none). A preference only -- list_my_stories() still
  // decides which stories are the caller's (Rule 2); this just narrows them.
  const country =
    countryFromCookieValue((await cookies()).get(COUNTRY_COOKIE)?.value) ??
    DEFAULT_COUNTRY_SLUG;
  const allStories = await listMyStoriesWithCovers();
  const stories = allStories.filter(
    (story) => (story.country_slug ?? DEFAULT_COUNTRY_SLUG) === country,
  );
  // One batch call, not one per row -- see 20260903100100's own note about
  // not reintroducing the N+1 this page had removed.
  const takedowns = await listMyTakedownRequests();

  return (
    <>
      <Suspense fallback={null}>
        <SubmissionToast />
      </Suspense>
      <MyStoriesView
        stories={stories}
        takedownRequests={takedowns}
        country={country}
        hasStoriesElsewhere={allStories.length > stories.length}
      />
    </>
  );
}
