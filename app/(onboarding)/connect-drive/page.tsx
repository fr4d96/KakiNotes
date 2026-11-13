import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { callerMustConnectDrive } from "@/lib/auth/drive-binding";
import { isDriveConfigured } from "@/lib/env.server";
import { SignOutButton } from "@/app/(contributor)/account/sign-out-button";
import { parseConnectDriveStatus } from "./status";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("connectDrive");
  return { title: t("metaTitle") };
}

/**
 * The mandatory "connect Google Drive" step. The (contributor) layout sends
 * every ordinary contributor without an active Drive connection here, and
 * the Drive OAuth callback sends a failed or cancelled attempt back here
 * with ?drive=<status>, so the reason is shown instead of being lost.
 *
 * Anyone who doesn't need this step (already connected, staff, or Drive not
 * configured on this deployment) is forwarded to the Drive tab on Account,
 * carrying the same status along -- that is where a staff member's or a
 * reconnecting contributor's attempt would have landed before this page
 * existed.
 */
export default async function ConnectDrivePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const status = parseConnectDriveStatus((await searchParams).drive);

  if (!(await callerMustConnectDrive())) {
    const forwarded = isDriveConfigured() ? status : "unavailable";
    redirect(
      forwarded ? `/account?drive=${forwarded}#drive` : "/account#drive",
    );
  }

  const [t, tDrive] = await Promise.all([
    getTranslations("connectDrive"),
    getTranslations("account.drive"),
  ]);

  return (
    <div className="mx-auto max-w-xl px-4 pt-8 pb-16 sm:px-6 sm:py-16">
      <h1 className="journiq-heading text-[2rem] leading-tight sm:text-[2.4rem]">
        {t("title")}
      </h1>
      <p className="mt-4 text-foreground/75">{t("intro")}</p>

      <ul className="mt-6 space-y-3 text-sm text-foreground/75">
        <li>{t("points.yourDrive")}</li>
        <li>{t("points.onlyOurFiles")}</li>
        <li>{t("points.fullQuality")}</li>
      </ul>

      {status === "cancelled" && (
        <p role="status" className="mt-6 text-sm text-foreground/65">
          {tDrive("banners.cancelled")}
        </p>
      )}
      {status === "failed" && (
        <p role="alert" className="mt-6 text-sm text-destructive">
          {tDrive("banners.failed")}
        </p>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-3">
        {/* A plain link, not next/link: /account/drive/connect is a Route
            Handler that redirects off-site to Google's consent screen. */}
        <a
          href="/account/drive/connect"
          className="journiq-button inline-flex items-center justify-center bg-accent text-accent-foreground"
        >
          {tDrive("connect")}
        </a>
        <SignOutButton />
      </div>

      <p className="mt-6 text-xs text-foreground/60">{t("whyRequired")}</p>
    </div>
  );
}
