import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/auth/roles";
import { isReviewOnly } from "@/lib/auth/staff-menu";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { YouView } from "@/app/(contributor)/account/you-view";
import type { DriveResultStatus } from "@/app/(contributor)/account/drive-tab";
import { isLocale } from "@/i18n/locales";
import { isDriveConfigured } from "@/lib/env.server";
import { getMyDriveConnectionStatus } from "@/lib/drive/connection-status";
import { getMyDriveMoveSummary } from "@/lib/story/media-move";

// Server Actions on this page use the page's maxDuration. One "move a photo
// to Drive" step downloads, uploads and re-downloads a photo of up to 8 MiB,
// so it gets the same 60s the Drive upload finalize step is planned for
// (docs/google-drive-integration.md, Decision Q10).
export const maxDuration = 60;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account");
  return { title: t("metaTitle") };
}

const DRIVE_RESULT_STATUSES: readonly DriveResultStatus[] = [
  "connected",
  "cancelled",
  "failed",
  "unavailable",
];

function parseDriveResultStatus(
  value: string | string[] | undefined,
): DriveResultStatus {
  const raw = Array.isArray(value) ? value[0] : value;
  return (DRIVE_RESULT_STATUSES as readonly string[]).includes(raw ?? "")
    ? (raw as DriveResultStatus)
    : null;
}

/**
 * Enforced signed-in by the (contributor) layout already — this page only
 * needs to read the caller's own rows, which RLS scopes to auth.uid() on
 * every table it touches (never a client-supplied id).
 */
export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [user, rawSearchParams] = await Promise.all([
    getCurrentUser(),
    searchParams,
  ]);
  if (!user) {
    return null;
  }
  const driveResultStatus = parseDriveResultStatus(rawSearchParams.drive);
  const driveConfigured = isDriveConfigured();

  const supabase = await createClient();
  const [
    { data: profile },
    { data: contributor },
    { data: usernameRow },
    driveConnection,
  ] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", user.id).single(),
    supabase
      .from("contributors")
      .select(
        "display_name, attribution_type, public_status, public_slug, bio, home_country_code, avatar_emoji",
      )
      .eq("linked_user_id", user.id)
      .maybeSingle(),
    // The caller's OWN username row only. RLS ("usernames: owner reads
    // own username") scopes this to auth.uid() regardless of the filter,
    // and the table has no anon grant at all, so nobody else's username
    // is reachable from here or anywhere else.
    supabase
      .from("usernames")
      .select("username")
      .eq("user_id", user.id)
      .maybeSingle(),
    // Skipped entirely when not configured on this deployment -- there is
    // nothing useful for the RPC to tell us, and no point paying for the
    // round trip (e.g. every Vercel preview build until Drive env vars are
    // set there).
    driveConfigured
      ? getMyDriveConnectionStatus()
      : Promise.resolve({
          connected: false,
          googleAccountEmail: null,
          connectedAt: null,
        }),
  ]);

  // Only worth asking once Drive is connected: the move tool needs it.
  const driveMoveSummary =
    driveConfigured && driveConnection.connected
      ? await getMyDriveMoveSummary()
      : null;

  const locale = await getLocale();
  const reviewOnly = isReviewOnly(await getCurrentUserRole());

  return (
    <YouView
      reviewOnly={reviewOnly}
      locale={isLocale(locale) ? locale : "en"}
      accountName={profile?.display_name ?? ""}
      username={usernameRow?.username ?? ""}
      avatarEmoji={contributor?.avatar_emoji ?? ""}
      identity={
        contributor
          ? {
              displayName: contributor.display_name,
              attributionType: contributor.attribution_type,
              publicProfileEnabled: contributor.public_status === "public",
              publicSlug: contributor.public_slug ?? "",
              bio: contributor.bio ?? "",
              homeCountryCode: contributor.home_country_code ?? "",
            }
          : null
      }
      drive={{
        configured: driveConfigured,
        connection: driveConnection,
        resultStatus: driveResultStatus,
        moveSummary: driveMoveSummary,
      }}
    />
  );
}
