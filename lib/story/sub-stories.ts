import "server-only";
import { cache } from "react";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";

// Sub stories (supabase/migrations/20261003051644_story_level_sub_stories.sql):
// a published story can be linked under a "main story" by the same
// contributor, two levels only. The link lives on the STORY and goes public
// as soon as the owner sets it -- both stories must already be published.
//
// Every rule (owner only, both published, same contributor, two levels, not
// itself) is enforced by set_story_parent_story(). Nothing here decides
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

/**
 * Pairs the family's sub story links with full card rows (from
 * list_published_stories(), same contributor) by slug, keeping the
 * family's order. Only slugs the family read already returned can match,
 * so a card row can never add a story the family gate didn't approve.
 * Anything without a card row (contributor has more published stories than
 * one page, or no public profile) comes back in `unmatched` so the page can
 * still link to it.
 */
export function matchSubStoryCards<T extends { slug: string }>(
  subStories: SubStoryLink[],
  cards: T[],
): { cards: T[]; unmatched: SubStoryLink[] } {
  const bySlug = new Map(cards.map((c) => [c.slug, c]));
  const matched: T[] = [];
  const unmatched: SubStoryLink[] = [];
  for (const s of subStories) {
    const card = bySlug.get(s.slug);
    if (card) matched.push(card);
    else unmatched.push(s);
  }
  return { cards: matched, unmatched };
}

export type StoryParentStory = {
  parent: { storyId: string; title: string | null; slug: string } | null;
  /** True when other stories are linked under this one, so it can't become a sub story. */
  hasSubStories: boolean;
};

/**
 * Owner only (the RPC checks). The generated types say the parent columns
 * are non-null; they are null when the story has no main story, hence the
 * explicit checks.
 */
export async function getStoryParentStory(
  storyId: string,
): Promise<StoryParentStory> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_story_parent_story", {
    p_story_id: storyId,
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
 * Owner only: the same contributor's published stories that are not
 * themselves sub stories. A convenience for the picker only --
 * set_story_parent_story() re-checks every rule on save.
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
