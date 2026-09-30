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

// set_revision_parent_story() (20260930083209_sub_stories.sql) names each
// refusal with its own SQLSTATE, so the editor can say what went wrong in
// the reader's language instead of showing Postgres text.
const SUB_STORY_ERROR_KEYS = {
  WHV10: "subStorySelf",
  WHV11: "subStoryNotFound",
  WHV12: "subStoryParentNotPublished",
  WHV13: "subStoryParentIsSubStory",
  WHV14: "subStoryHasSubStories",
} as const;

export type SubStoryErrorKey =
  (typeof SUB_STORY_ERROR_KEYS)[keyof typeof SUB_STORY_ERROR_KEYS];

/** The actionErrors.* key for a sub-story refusal, or null for anything else. */
export function subStoryErrorKey(error: unknown): SubStoryErrorKey | null {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return null;
  }
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && Object.hasOwn(SUB_STORY_ERROR_KEYS, code)
    ? SUB_STORY_ERROR_KEYS[code as keyof typeof SUB_STORY_ERROR_KEYS]
    : null;
}
