// Structured RPC error classification. Supabase/PostgREST surfaces a
// Postgres error's SQLSTATE as `.code` on the thrown/returned error object
// -- already an established pattern in this codebase:
// app/(contributor)/actions.ts#createOwnContributorAction already checks
// `error.code === "23505"` (unique_violation) on a real Supabase error, so
// this isn't a new mechanism, just applying the existing one to the custom
// 'WHV01' SQLSTATE that
// supabase/migrations/20260804092100_submit_consent_requires_terms_version.sql's
// submit_revision_with_consent() raises when the caller's
// p_expected_terms_version no longer matches current_terms_version().

export function isTermsChangedError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "WHV01"
  );
}

// set_story_parent() (supabase/migrations/20261021085920_story_folders.sql)
// names each refusal with its own SQLSTATE, so the story folders view and
// its Move-to fallback can say what went wrong in the reader's language
// instead of showing Postgres text.
//
// These are the same subStory* keys (and the same WHV10/WHV11/WHV13/WHV14/
// WHV15 codes) the very first main/sub-story design used
// (20261003051644_story_level_sub_stories.sql) -- the free-link design in
// between (20261013004751_story_links.sql, now dropped) retired WHV13/WHV14
// because they had no meaning for symmetric, unlimited links; folders bring
// back the one-level rule those two codes exist to enforce, so the keys are
// restored rather than reinvented. WHV12 ("main story not published") is
// folded into WHV15 now (set_story_parent() checks both sides with one
// check), and WHV16 ("already linked", a free-link-only concept) stays
// retired.
const STORY_FOLDER_ERROR_KEYS = {
  WHV10: "subStorySelf",
  WHV11: "subStoryNotFound",
  WHV13: "subStoryParentIsSubStory",
  WHV14: "subStoryHasSubStories",
  WHV15: "subStoryNotPublished",
} as const;

export type StoryFolderErrorKey =
  (typeof STORY_FOLDER_ERROR_KEYS)[keyof typeof STORY_FOLDER_ERROR_KEYS];

/** The actionErrors.* key for a story-folder refusal, or null for anything else. */
export function storyFolderErrorKey(
  error: unknown,
): StoryFolderErrorKey | null {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return null;
  }
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" &&
    Object.hasOwn(STORY_FOLDER_ERROR_KEYS, code)
    ? STORY_FOLDER_ERROR_KEYS[code as keyof typeof STORY_FOLDER_ERROR_KEYS]
    : null;
}
