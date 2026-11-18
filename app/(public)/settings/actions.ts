"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AVATAR_EMOJI_OPTIONS } from "@/lib/avatar";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { invalidateContributorPublicCache } from "@/lib/story/public-cache";
import { createClient } from "@/lib/supabase/server";

/** One of the fixed set, or "" for no avatar. */
const avatarSchema = z.enum(AVATAR_EMOJI_OPTIONS).or(z.literal(""));

export type SetAvatarResult =
  | { ok: true; avatarEmoji: string | null }
  | { ok: false; reason: "signed-out" | "invalid" | "failed" };

/**
 * Sets the caller's avatar emoji from Settings (moved there from Account →
 * Contributor identity, 2026-11-18).
 *
 * Writes BOTH places the avatar lives, for the caller only:
 *  - `profiles.avatar_emoji`, the account record, which every signed-in
 *    account has -- so someone who has not set up a contributor identity
 *    yet can still pick one, and createOwnContributorAction copies it onto
 *    the identity when they do;
 *  - `contributors.avatar_emoji`, the public face on story cards and the
 *    byline page, when the caller has a contributor row.
 * Both reads of it (lib/auth/roles.ts, lib/auth/viewer-identity.ts) prefer
 * the contributor's and fall back to the profile's, so the two never show
 * different avatars.
 *
 * Never trusts the client for WHO (Engineering Rule 2): the user id comes
 * from the server session, and RLS ("profiles: owner updates own profile",
 * the contributors owner-update policy) independently refuses any other
 * row. The value is re-validated against the fixed set here, and the
 * columns' CHECK constraints are the final word (Rule 3). Nothing here
 * touches user_roles: the avatar is profile data, kept apart from role
 * data (Rule 4).
 */
export async function setAvatarAction(
  value: unknown,
): Promise<SetAvatarResult> {
  const parsed = avatarSchema.safeParse(value);
  if (!parsed.success) return { ok: false, reason: "invalid" };

  const user = await getCurrentUser();
  if (!user) return { ok: false, reason: "signed-out" };

  const avatarEmoji = parsed.data || null;
  const supabase = await createClient();

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ avatar_emoji: avatarEmoji })
    .eq("id", user.id);
  if (profileError) return { ok: false, reason: "failed" };

  const { data: contributor, error: contributorError } = await supabase
    .from("contributors")
    .update({ avatar_emoji: avatarEmoji })
    .eq("linked_user_id", user.id)
    .select("public_slug")
    .maybeSingle();
  if (contributorError) return { ok: false, reason: "failed" };

  // The avatar shows on the contributor's own pages and on their story
  // cards; the public data caches would otherwise keep the old one for up
  // to a minute.
  if (contributor?.public_slug) {
    invalidateContributorPublicCache(contributor.public_slug);
  }
  revalidatePath("/account");
  return { ok: true, avatarEmoji };
}
