import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env.server";
import type { Database } from "@/types/database";

/**
 * A cookie-free Supabase client for genuinely anonymous public reads
 * (list_published_stories, get_published_story, list_public_contributors,
 * etc. -- the only three-plus RPCs granted to `anon`, per
 * docs/architecture.md "Public reads"). lib/supabase/server.ts calls
 * next/headers' cookies(), which unconditionally opts a route out of static
 * rendering/ISR in the App Router regardless of `export const revalidate`
 * -- verified by reading its implementation before assuming `revalidate`
 * would do anything on a page that only ever calls anon-granted RPCs.
 *
 * Until 2026-09-14 that is what let `export const revalidate = 60` take
 * effect on `/`, `/stories/[id]` and `/contributors/[slug]`. The root
 * layout now reads the language cookie, so every route renders per request
 * and those exports are gone -- but cookie-freeness matters MORE now, not
 * less: it is what lets unstable_cache() wrap these reads at all (a cached
 * function may not touch cookies or headers), which is how the same 60s
 * window survives at the data layer (lib/story/public-queries.ts). It does
 * NOT make `/stories` or `/contributors` cacheable -- those await
 * `searchParams` and deliberately call the uncached readers, so a filter
 * result is always fresh. Never used for anything that needs the caller's
 * session (auth state, ownership, RLS-scoped reads) -- those still go
 * through lib/supabase/server.ts.
 */
export function createPublicClient() {
  return createSupabaseClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false } },
  );
}
