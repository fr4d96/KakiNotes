import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { resolveContributorAccess } from "@/lib/auth/contributor-guard";
import { callerMustConnectDrive } from "@/lib/auth/drive-binding";
import { CONNECT_DRIVE_PATH } from "@/lib/auth/drive-binding-guard";
import { ContributorNav } from "@/components/contributor-nav";
import { BottomTabBar } from "@/components/bottom-tab-bar";
import { PageTransition } from "@/components/page-transition";

/**
 * The only place in the app that calls getCurrentUser(). Public layouts
 * never do this: their HTML must carry nothing per-person, so the data
 * behind it can be cached and shared (lib/story/public-queries.ts). The
 * public pages themselves have rendered per request since the language
 * cookie (2026-09-14); it is the data cache, not page staticness, that a
 * session read here would defeat.
 */
export default async function ContributorLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  const access = resolveContributorAccess(user);

  if (!access.ok) {
    redirect(access.redirectTo);
  }

  // Every ordinary contributor must have Google Drive connected before using
  // anything here (photos live in their own Drive, never in Supabase storage
  // -- docs/google-drive-integration.md, "Mandatory Drive connection").
  // /connect-drive lives OUTSIDE this route group, so this can't loop. The
  // Drive OAuth routes under /account/drive are Route Handlers, which layouts
  // never wrap, so the connect flow itself stays reachable.
  if (await callerMustConnectDrive()) {
    redirect(CONNECT_DRIVE_PATH);
  }

  return (
    <>
      <ContributorNav />
      <main id="main-content" className="flex-1">
        <PageTransition>{children}</PageTransition>
      </main>
      <BottomTabBar signedInHint />
    </>
  );
}
