import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { AccountTabs } from "@/app/(contributor)/account/account-tabs";
import { ProfileForm } from "@/app/(contributor)/account/profile-form";
import { UsernameForm } from "@/app/(contributor)/account/username-form";
import { ContributorForm } from "@/app/(contributor)/account/contributor-form";
import { SignOutButton } from "@/app/(contributor)/account/sign-out-button";
import {
  DriveTab,
  type DriveResultStatus,
} from "@/app/(contributor)/account/drive-tab";
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
  const [user, t, rawSearchParams] = await Promise.all([
    getCurrentUser(),
    getTranslations("account"),
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

  const currentUsername = usernameRow?.username ?? "";

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
      <div className="flex items-center justify-between gap-4">
        <h1 className="journiq-heading text-[2.4rem]">{t("title")}</h1>
        <SignOutButton />
      </div>

      {/* A brand new account has no contributor identity yet, and the first
          sign-in is routed straight here for that reason (see
          lib/auth/post-login-redirect.ts). The prompt is driven by the real
          absence of the row, not by a one-shot query parameter, so it also
          catches anyone who skipped the step and came back later. The link
          stays a plain #hash anchor: AccountTabs watches hashchange, so it
          opens the tab rather than needing to reach into its state. */}
      {!contributor && (
        <div className="mt-6 rounded-md border border-border-subtle bg-surface-muted p-4 text-sm">
          <p className="font-medium">{t("setupPromptTitle")}</p>
          <p className="mt-1 text-foreground/70">
            {t("setupPromptBodyBefore")}{" "}
            <a
              href="#contributor-identity"
              className="underline underline-offset-2"
            >
              {t("setupPromptLink")}
            </a>
            .
          </p>
        </div>
      )}

      <AccountTabs
        label={t("tablistLabel")}
        tabs={[
          {
            id: "profile",
            label: t("tabs.profile"),
            description: t("tabs.profileDescription"),
            panel: <ProfileForm displayName={profile?.display_name ?? ""} />,
          },
          {
            id: "sign-in",
            label: t("tabs.signIn"),
            description: t("tabs.signInDescription"),
            panel: <UsernameForm username={currentUsername} />,
          },
          {
            id: "contributor-identity",
            label: t("tabs.contributorIdentity"),
            description: t("tabs.contributorIdentityDescription"),
            panel: (
              <ContributorForm
                existing={
                  contributor
                    ? {
                        displayName: contributor.display_name,
                        attributionType: contributor.attribution_type,
                        publicProfileEnabled:
                          contributor.public_status === "public",
                        publicSlug: contributor.public_slug ?? "",
                        bio: contributor.bio ?? "",
                        homeCountryCode: contributor.home_country_code ?? "",
                        avatarEmoji: contributor.avatar_emoji ?? "",
                      }
                    : null
                }
              />
            ),
          },
          {
            id: "drive",
            label: t("tabs.drive"),
            description: t("tabs.driveDescription"),
            panel: (
              <DriveTab
                configured={driveConfigured}
                connection={driveConnection}
                resultStatus={driveResultStatus}
                moveSummary={driveMoveSummary}
              />
            ),
          },
        ]}
      />
    </div>
  );
}
