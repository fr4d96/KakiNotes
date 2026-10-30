"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeftIcon } from "@/components/icons";
import { pageBack } from "@/lib/navigation/page-titles";
import { canGoBackInApp } from "@/lib/navigation/in-app-history";

/**
 * The top-left back arrow of a sub-page, the way Instagram and Facebook do
 * it: an icon, no "Back to …" text. Where it goes comes from
 * lib/navigation/page-titles.ts (one table, shared with the phone top bar),
 * and its accessible name says where ("Back to My Stories").
 *
 * `variant="bar"` is the top-bar arrow (header-brand.tsx), phone-only except
 * on a story's pages, which have no heading row for the desktop arrow; the
 * default sits beside a page's heading and is desktop-only, because on a
 * phone the bar already has one. Renders nothing on a page with no back
 * target. Navigates with the `nav-back` view-transition type, so the page
 * slides back the way it came (components/page-transition.tsx).
 *
 * A story's pages (`history`) go back to wherever the reader came from with
 * history.back(); the link's href is the fallback for a reader who landed
 * there directly (lib/navigation/in-app-history.ts).
 */
export function BackLink({ variant = "page" }: { variant?: "page" | "bar" }) {
  const t = useTranslations();
  const back = pageBack(usePathname());
  if (!back) return null;
  // A history page's arrow lives in the bar at every width.
  if (back.history && variant === "page") return null;

  return (
    <Link
      href={back.href}
      transitionTypes={["nav-back"]}
      onClick={(event) => {
        if (!back.history || !canGoBackInApp()) return;
        event.preventDefault();
        // The browser's own back, which the App Router handles like a
        // Link (no reload); no useRouter, so this renders without one.
        window.history.back();
      }}
      aria-label={
        back.history
          ? t("common.back")
          : t("common.backTo", { page: t(back.labelKey as never) })
      }
      className={
        variant === "bar"
          ? `press -ml-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${back.history ? "" : "md:hidden"}`
          : "press inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border-subtle hover:bg-surface-muted max-md:hidden"
      }
    >
      <ArrowLeftIcon className={variant === "bar" ? "h-6 w-6" : "h-5 w-5"} />
    </Link>
  );
}
