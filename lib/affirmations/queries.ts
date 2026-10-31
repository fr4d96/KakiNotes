import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { AFFIRMATION_TOKEN_PATTERN } from "@/lib/validation/affirmation";
import type {
  AffirmationLink,
  AffirmationNote,
  AffirmationWritingTarget,
} from "./types";

/**
 * The owner's own links. The caller is derived from the session, never
 * passed in; list_my_affirmation_links() is SECURITY INVOKER, so RLS
 * ("owner reads own links") is what actually scopes it.
 */
export async function listMyAffirmationLinks(): Promise<AffirmationLink[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data: rows, error } = await supabase.rpc("list_my_affirmation_links");
  if (error) throw error;
  // note_count is a bigint, which PostgREST may serialise as a string.
  return (rows ?? []).map((row) => ({
    ...row,
    note_count: Number(row.note_count),
  }));
}

/** Notes on the owner's own links, newest first. */
export async function listMyAffirmationNotes(): Promise<AffirmationNote[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data: rows, error } = await supabase.rpc("list_my_affirmation_notes");
  if (error) throw error;
  return rows ?? [];
}

/**
 * The writing page's one lookup. Anonymous (cookie-free client, anon key):
 * returns null for a malformed, unknown or switched-off token without saying
 * which. The RPC returns only a label and the owner's PUBLIC contributor
 * name (Engineering Rule 16).
 */
export async function getAffirmationWritingTarget(
  token: string,
): Promise<AffirmationWritingTarget | null> {
  if (!AFFIRMATION_TOKEN_PATTERN.test(token)) return null;
  try {
    const { data: rows, error } = await createPublicClient().rpc(
      "get_affirmation_link_for_writing",
      { p_token: token },
    );
    if (error) throw error;
    return rows?.[0] ?? null;
  } catch {
    return null;
  }
}
