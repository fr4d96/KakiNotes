import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { getMyStoryFolders } from "@/lib/story/story-folders";
import { listMyStories } from "@/lib/story/contributor-queries";
import {
  COUNTRY_COOKIE,
  DEFAULT_COUNTRY_SLUG,
  countryFromCookieValue,
} from "@/lib/story/countries";
import { StoryFoldersView } from "./story-folders-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("storyFolders");
  return { title: t("metaTitle") };
}

/**
 * Contributor-only (gated by app/(contributor)/layout.tsx, same as every
 * other route in this group). Loads the caller's own stories and their
 * current folder once per visit via get_my_story_folders() -- owner-scoped
 * RPC, never trusts anything from the client -- and hands them to the
 * client component that renders the folder list and the tap-first
 * "pick a main story, tick its sub stories" picker.
 *
 * Only the stories of the country chosen in the top bar (the
 * kakinotes-country cookie, New Zealand when none), like My Stories: each
 * story's country comes from list_my_stories()'s country_slug, the same
 * owner-scoped read, so no folder or picker offers another country's story.
 * A preference only -- who may file what is still decided by
 * set_story_parent() (Engineering Rule 2).
 *
 * Route kept at /my-stories/map (not renamed) so existing links and
 * bookmarks keep working -- only the page's own title/copy changed, from
 * the free-link story map to story folders (2026-10-21).
 */
export default async function StoryFoldersPage() {
  const country =
    countryFromCookieValue((await cookies()).get(COUNTRY_COOKIE)?.value) ??
    DEFAULT_COUNTRY_SLUG;
  const [stories, mine] = await Promise.all([
    getMyStoryFolders(),
    listMyStories(),
  ]);
  const inCountry = new Set(
    mine
      .filter((s) => (s.country_slug ?? DEFAULT_COUNTRY_SLUG) === country)
      .map((s) => s.id),
  );
  return (
    <StoryFoldersView stories={stories.filter((s) => inCountry.has(s.id))} />
  );
}
