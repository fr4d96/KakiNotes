import "server-only";
import { cache } from "react";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";

// Story folders (supabase/migrations/20261021085920_story_folders.sql): one
// level only -- a story is either a MAIN story (may have sub stories), a SUB
// story (filed under exactly one main story), or neither. Replaces the
// free, undirected story-links design (lib/story/story-links.ts, now
// removed). The link lives on stories.parent_story_id and goes public as
// soon as the owner sets it via set_story_parent() -- not moderated
// (documented exception to Engineering Rule 11).
//
// Every rule (owner of both to file, both published, one level only,
// removing always allowed) is enforced by set_story_parent(). Nothing here
// decides anything; these are typed readers over the RPCs.

const familyLinkSchema = z.object({
  slug: z.string(),
  title: z.string(),
  excerpt: z.string().nullable().optional(),
});

export type StoryFamilyLink = z.infer<typeof familyLinkSchema>;

export type PublishedStoryFamily = {
  parent: StoryFamilyLink | null;
  subStories: StoryFamilyLink[];
};

const EMPTY_FAMILY: PublishedStoryFamily = { parent: null, subStories: [] };

/**
 * Anonymous-safe. get_published_story_family() only reads published
 * revisions and checks BOTH ends against the same visibility gate as
 * get_published_story(), so a draft, private, archived or consent-revoked
 * story can never surface here in either direction.
 *
 * Uncached across requests for the same reason getPublishedStoryBySlug is
 * (lib/story/public-queries.ts header): a taken-down story must disappear
 * from its family immediately.
 */
export async function getPublishedStoryFamily(
  storyId: string,
): Promise<PublishedStoryFamily> {
  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc("get_published_story_family", {
    p_story_id: storyId,
  });
  if (error) throw error;
  const row = data?.[0];
  if (!row) return EMPTY_FAMILY;

  const parent = familyLinkSchema.safeParse(row.parent);
  const subStories = z.array(familyLinkSchema).safeParse(row.sub_stories);
  return {
    parent: parent.success ? parent.data : null,
    subStories: subStories.success ? subStories.data : [],
  };
}

/** Per-request dedupe only, never across requests. */
export const getPublishedStoryFamilyDeduped = cache(getPublishedStoryFamily);

/**
 * Pairs a family's links with full card rows (from
 * list_published_stories(), same contributor) by slug, keeping the
 * family's order. Only slugs the family read already returned can match,
 * so a card row can never add a story the family gate didn't approve.
 * Anything without a card row (contributor has more published stories than
 * one page, or no public profile) comes back in `unmatched` so the page can
 * still link to it.
 */
export function matchStoryFamilyCards<T extends { slug: string }>(
  links: StoryFamilyLink[],
  cards: T[],
): { cards: T[]; unmatched: StoryFamilyLink[] } {
  const bySlug = new Map(cards.map((c) => [c.slug, c]));
  const matched: T[] = [];
  const unmatched: StoryFamilyLink[] = [];
  for (const link of links) {
    const card = bySlug.get(link.slug);
    if (card) matched.push(card);
    else unmatched.push(link);
  }
  return { cards: matched, unmatched };
}

export type StoryFolderEntry = {
  id: string;
  slug: string;
  title: string | null;
  lifecycleStatus: string;
  /** True only when published -- set_story_parent() refuses anything else. */
  linkable: boolean;
  parentStoryId: string | null;
};

const folderEntrySchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string().nullable(),
  lifecycle_status: z.string(),
  linkable: z.boolean(),
  parent_story_id: z.string().nullable(),
});

/**
 * Owner only (the RPC checks via the same source-kind-partitioned
 * ownership rule list_my_stories() uses). Backs the story folders page
 * (app/(contributor)/my-stories/map/).
 */
export async function getMyStoryFolders(): Promise<StoryFolderEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_story_folders");
  if (error) throw error;
  const parsed = z.array(folderEntrySchema).safeParse(data ?? []);
  if (!parsed.success) return [];
  return parsed.data.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    lifecycleStatus: row.lifecycle_status,
    linkable: row.linkable,
    parentStoryId: row.parent_story_id,
  }));
}
