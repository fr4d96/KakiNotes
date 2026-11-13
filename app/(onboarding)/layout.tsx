import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { resolveContributorAccess } from "@/lib/auth/contributor-guard";
import { SiteHeader } from "@/components/site-header";
import { PageTransition } from "@/components/page-transition";

/**
 * Signed-in steps a contributor must finish before the (contributor) area
 * opens -- today only /connect-drive. Deliberately OUTSIDE (contributor), so
 * that group's layout can redirect here without looping, and deliberately
 * without the contributor nav / bottom tab bar: every link in those would
 * just bounce back here until the step is done.
 *
 * Same sign-in check as (contributor)/layout.tsx; proxy.ts also redirects a
 * signed-out request first (PROTECTED_PATHS).
 */
export default async function OnboardingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const access = resolveContributorAccess(await getCurrentUser());
  if (!access.ok) {
    redirect(access.redirectTo);
  }

  return (
    <>
      <SiteHeader />
      <main id="main-content" className="flex-1">
        <PageTransition>{children}</PageTransition>
      </main>
    </>
  );
}
