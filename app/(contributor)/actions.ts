"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { getTranslations } from "next-intl/server";
import { invalidateContributorPublicCache } from "@/lib/story/public-cache";
import { PUBLIC_CONTRIBUTORS_TAG } from "@/lib/story/public-queries";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  profileUpdateSchema,
  createOwnContributorSchema,
  type CreateOwnContributorInput,
} from "@/lib/validation/profile";
import { setUsernameSchema } from "@/lib/validation/username";
import { firstIssueMessage } from "@/lib/validation/issue-messages";

export type AccountFormState = {
  error?: string;
  success?: string;
};

/**
 * Shared by createOwnContributorAction/updateOwnContributorAction: the same
 * two rules list_public_contributors() (supabase/migrations/
 * 20260805100300_public_contributor_functions.sql) enforces at read time —
 * a public contributor needs a slug, and an anonymous one is never shown in
 * the directory regardless of public_status — checked here too so the
 * contributor gets an immediate, specific error instead of silently saving
 * a "public" record that never actually appears anywhere.
 */
/**
 * next-intl's translator over the `account` namespace. Derived from
 * getTranslations()'s own return type so the helper below keeps full key
 * checking without repeating next-intl's generics.
 */
type AccountTranslator = Awaited<ReturnType<typeof getTranslations<"account">>>;

function checkContributorPublicVisibility(
  data: CreateOwnContributorInput,
  t: AccountTranslator,
): AccountFormState | null {
  if (!data.publicProfileEnabled) return null;
  if (!data.publicSlug) {
    return { error: t("errors.slugRequiredForPublic") };
  }
  if (data.attributionType === "anonymous") {
    return { error: t("errors.anonymousCannotBePublic") };
  }
  return null;
}

/**
 * The account record only. Since 20260910090000 every publicly visible
 * field -- bio, avatar, home country, the directory opt-in, the slug --
 * belongs to the caller's `contributors` row and is written by
 * create/updateOwnContributorAction below. This action deliberately writes
 * ONE column so a stale form field can never resurrect the old duplicate
 * public identity.
 */
export async function updateProfileAction(
  _prevState: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const [t, tv, tCommon] = await Promise.all([
    getTranslations("account"),
    getTranslations("validation"),
    getTranslations("common"),
  ]);
  const user = await getCurrentUser();
  if (!user) {
    return { error: tCommon("mustBeSignedIn") };
  }

  const parsed = profileUpdateSchema.safeParse({
    displayName: formData.get("displayName"),
  });

  if (!parsed.success) {
    return {
      error: firstIssueMessage(parsed.error, tv, "common.invalidInput"),
    };
  }

  const supabase = await createClient();
  // Ownership is never client-supplied: .eq("id", user.id) targets only the
  // caller's own row, and RLS ("profiles: owner updates own profile") would
  // reject any attempt to target another user's row regardless.
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: parsed.data.displayName })
    .eq("id", user.id);

  if (error) {
    return { error: t("errors.profileUpdateFailed") };
  }

  revalidatePath("/account");
  return { success: t("profile.saved") };
}

/**
 * Claims or changes the caller's optional sign-in username.
 *
 * Lives on its own table (supabase/migrations/20260909090000_usernames.sql)
 * rather than as a profiles column, so it is a separate action and a
 * separate write rather than another field folded into
 * updateProfileAction — see that migration's header for why the column
 * cannot live on profiles.
 *
 * user_id is taken from the server-known session and never from the form
 * (Engineering Rule 2); the table's own "usernames: owner claims own
 * username" / "owner updates own username" policies independently reject
 * anything else regardless.
 */
export async function setUsernameAction(
  _prevState: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const [t, tv, tCommon] = await Promise.all([
    getTranslations("account"),
    getTranslations("validation"),
    getTranslations("common"),
  ]);
  const user = await getCurrentUser();
  if (!user) {
    return { error: tCommon("mustBeSignedIn") };
  }

  const parsed = setUsernameSchema.safeParse({
    username: formData.get("username"),
  });

  if (!parsed.success) {
    return {
      error: firstIssueMessage(parsed.error, tv, "common.invalidInput"),
    };
  }

  const supabase = await createClient();
  // Deliberately no "is this taken?" pre-check: two people claiming the
  // same username at the same moment would both pass it and one would
  // still fail on insert. The unique index is the only thing that can
  // actually decide, so the 23505 it raises is the answer — same pattern
  // as updateProfileAction's public_slug handling above.
  const { error } = await supabase
    .from("usernames")
    .upsert(
      { user_id: user.id, username: parsed.data.username },
      { onConflict: "user_id" },
    );

  if (error) {
    if (error.code === "23505") {
      return { error: t("errors.usernameTaken") };
    }
    return { error: t("errors.usernameSaveFailed") };
  }

  revalidatePath("/account");
  return { success: t("username.saved") };
}

/**
 * /contributors/[slug] caches its DATA for 60s (lib/story/public-queries.ts,
 * since the language cookie made the page itself dynamic) and /contributors
 * is dynamic on searchParams, so both would catch up on their own within a
 * minute. Nudging them means a contributor who just saved their bio sees it
 * immediately instead of reloading and wondering. Only the NEW slug is
 * revalidated -- a renamed slug's old path stops resolving anyway, since
 * get_public_contributor() matches on the current value. Without a slug
 * there is no byline page to purge, but the directory and the data tag
 * still are.
 */
function revalidateContributorPublicPages(slug: string | undefined): void {
  if (slug) {
    invalidateContributorPublicCache(slug);
  } else {
    revalidatePath("/contributors");
    revalidateTag(PUBLIC_CONTRIBUTORS_TAG, { expire: 0 });
  }
}

export async function createOwnContributorAction(
  _prevState: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const [t, tv, tCommon] = await Promise.all([
    getTranslations("account"),
    getTranslations("validation"),
    getTranslations("common"),
  ]);
  const user = await getCurrentUser();
  if (!user) {
    return { error: tCommon("mustBeSignedIn") };
  }

  const parsed = createOwnContributorSchema.safeParse({
    displayName: formData.get("displayName"),
    attributionType: formData.get("attributionType"),
    publicProfileEnabled: formData.get("publicProfileEnabled") === "on",
    publicSlug: formData.get("publicSlug") ?? "",
    bio: formData.get("bio") ?? "",
    homeCountryCode: formData.get("homeCountryCode") ?? "",
    avatarEmoji: formData.get("avatarEmoji") ?? "",
  });

  if (!parsed.success) {
    return {
      error: firstIssueMessage(parsed.error, tv, "common.invalidInput"),
    };
  }
  const publicCheck = checkContributorPublicVisibility(parsed.data, t);
  if (publicCheck) return publicCheck;

  const supabase = await createClient();
  // linked_user_id and created_by are always set from the server-known
  // session, never from the form — matches the
  // "contributors: self-service create own contributor record" RLS policy,
  // which independently rejects anything else.
  const { error } = await supabase.from("contributors").insert({
    linked_user_id: user.id,
    created_by: user.id,
    display_name: parsed.data.displayName,
    attribution_type: parsed.data.attributionType,
    public_status: parsed.data.publicProfileEnabled ? "public" : "private",
    public_slug: parsed.data.publicSlug || null,
    bio: parsed.data.bio || null,
    home_country_code: parsed.data.homeCountryCode || null,
    avatar_emoji: parsed.data.avatarEmoji || null,
  });

  if (error) {
    if (error.code === "23505") {
      if (/public_slug/i.test(error.message)) {
        return { error: t("errors.slugTaken") };
      }
      return { error: t("errors.alreadyHaveIdentity") };
    }
    return {
      error: t("errors.identityCreateFailed"),
    };
  }

  revalidatePath("/account");
  revalidateContributorPublicPages(parsed.data.publicSlug);
  return { success: t("contributor.created") };
}

export async function updateOwnContributorAction(
  _prevState: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const [t, tv, tCommon] = await Promise.all([
    getTranslations("account"),
    getTranslations("validation"),
    getTranslations("common"),
  ]);
  const user = await getCurrentUser();
  if (!user) {
    return { error: tCommon("mustBeSignedIn") };
  }

  const parsed = createOwnContributorSchema.safeParse({
    displayName: formData.get("displayName"),
    attributionType: formData.get("attributionType"),
    publicProfileEnabled: formData.get("publicProfileEnabled") === "on",
    publicSlug: formData.get("publicSlug") ?? "",
    bio: formData.get("bio") ?? "",
    homeCountryCode: formData.get("homeCountryCode") ?? "",
    avatarEmoji: formData.get("avatarEmoji") ?? "",
  });

  if (!parsed.success) {
    return {
      error: firstIssueMessage(parsed.error, tv, "common.invalidInput"),
    };
  }
  const publicCheck = checkContributorPublicVisibility(parsed.data, t);
  if (publicCheck) return publicCheck;

  const supabase = await createClient();
  // .eq("linked_user_id", user.id) plus RLS together prevent editing any
  // contributor record other than the caller's own linked one.
  const { error } = await supabase
    .from("contributors")
    .update({
      display_name: parsed.data.displayName,
      attribution_type: parsed.data.attributionType,
      public_status: parsed.data.publicProfileEnabled ? "public" : "private",
      public_slug: parsed.data.publicSlug || null,
      bio: parsed.data.bio || null,
      home_country_code: parsed.data.homeCountryCode || null,
      avatar_emoji: parsed.data.avatarEmoji || null,
    })
    .eq("linked_user_id", user.id);

  if (error) {
    if (error.code === "23505" && /public_slug/i.test(error.message)) {
      return { error: t("errors.slugTaken") };
    }
    return {
      error: t("errors.identityUpdateFailed"),
    };
  }

  revalidatePath("/account");
  revalidateContributorPublicPages(parsed.data.publicSlug);
  return { success: t("contributor.updated") };
}
