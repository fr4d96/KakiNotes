import "server-only";
import { cache } from "react";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";

// Sub stories (supabase/migrations/20260930083209_sub_stories.sql): a story
// can be filed under a "main story" by the same contributor, two levels
// only. The link lives on the REVISION, so it is moderated like the rest of
// the content and only a published revision's link is ever shown publicly.
//
// Every rule (same contributor, main story published, two levels, not
// itself) is enforced by set_revision_parent_story(). Nothing here decides
// anything; these are typed readers over the RPCs.

const familyLinkSchema = z.object({
  slug: z.string(),
  title: z.string(),
});

const subStoryLinkSchema = familyLinkSchema.extend({
  excerpt: z.string().nullable().optional(),
});

export type StoryFamilyLink = z.infer<typeof familyLinkSchema>;
export type SubStoryLink = z.infer<typeof subStoryLinkSchema>;

export type PublishedStoryFamily = {
  parent: StoryFamilyLink | null;
  subStories: SubStoryLink[];
};

const EMPTY_FAMILY: PublishedStoryFamily = { parent: null, subStories: [] };

/**
 * Anonymous-safe. get_published_story_family() only reads published
 * revisions and checks BOTH ends of every link against the same visibility
 * gate as get_published_story(), so a draft, private, archived or
 * consent-revoked story can never surface here in either direction.
 *
 * Uncached across requests for the same reason getPublishedStoryBySlug is
 * (lib/story/public-queries.ts header): a taken-down story must disappear
 * from its main story's list immediately.
 */
export async function getPublishedStoryFamily(
  slug: string,
): Promise<PublishedStoryFamily> {
  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc("get_published_story_family", {
    p_slug: slug,
  });
  if (error) throw error;
  const row = data?.[0];
  if (!row) return EMPTY_FAMILY;

  const parent = familyLinkSchema.safeParse(row.parent);
  const subStories = z.array(subStoryLinkSchema).safeParse(row.sub_stories);
  return {
    parent: parent.success ? parent.data : null,
    subStories: subStories.success ? subStories.data : [],
  };
}

/** Per-request dedupe only, never across requests. */
export const getPublishedStoryFamilyDeduped = cache(getPublishedStoryFamily);

export type RevisionParentStory = {
  parent: { storyId: string; title: string | null; slug: string } | null;
  /** True when other stories are filed under this one, so it can't become a sub story. */
  hasSubStories: boolean;
};

/**
 * Owner, assigned editor, moderator or admin (the RPC checks). The generated
 * types say the parent columns are non-null; they are null when the revision
 * has no main story, hence the explicit checks.
 */
export async function getRevisionParentStory(
  revisionId: string,
): Promise<RevisionParentStory> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_revision_parent_story", {
    p_revision_id: revisionId,
  });
  if (error) throw error;
  const row = data?.[0];
  if (!row) return { parent: null, hasSubStories: false };
  return {
    parent:
      row.parent_story_id && row.parent_slug
        ? {
            storyId: row.parent_story_id,
            title: row.parent_title ?? null,
            slug: row.parent_slug,
          }
        : null,
    hasSubStories: Boolean(row.has_sub_stories),
  };
}

export type ParentStoryOption = {
  storyId: string;
  title: string;
  slug: string;
};

/**
 * Owner or assigned editor: the same contributor's published stories that
 * are not themselves sub stories. A convenience for the picker only --
 * set_revision_parent_story() re-checks every rule on save.
 */
export async function listParentStoryOptions(
  storyId: string,
): Promise<ParentStoryOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_parent_story_options", {
    p_story_id: storyId,
  });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    storyId: r.story_id,
    title: r.title,
    slug: r.slug,
  }));
}
