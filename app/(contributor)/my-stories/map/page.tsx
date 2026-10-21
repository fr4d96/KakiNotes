import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getMyStoryFolders } from "@/lib/story/story-folders";
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
 * client component that renders the folder list, its drag-and-drop filing
 * gesture, and the keyboard/screen-reader "Move to" fallback beside it.
 *
 * Route kept at /my-stories/map (not renamed) so existing links and
 * bookmarks keep working -- only the page's own title/copy changed, from
 * the free-link story map to story folders (2026-10-21).
 */
export default async function StoryFoldersPage() {
  const stories = await getMyStoryFolders();
  return <StoryFoldersView stories={stories} />;
}
