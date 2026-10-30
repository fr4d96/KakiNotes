"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeftIcon } from "@/components/icons";
import { pageBack } from "@/lib/navigation/page-titles";

/**
 * The top-left back arrow of a sub-page, the way Instagram and Facebook do
 * it: an icon, no "Back to …" text. Where it goes comes from
 * lib/navigation/page-titles.ts (one table, shared with the phone top bar),
 * and its accessible name says where ("Back to My Stories").
 *
 * `variant="bar"` is the phone top-bar arrow (header-brand.tsx); the default
 * sits beside a page's heading and is desktop-only, because on a phone the
 * bar already has one. Renders nothing on a page with no back target.
 * Navigates with the `nav-back` view-transition type, so the page slides
 * back the way it came (components/page-transition.tsx).
 */
export function BackLink({ variant = "page" }: { variant?: "page" | "bar" }) {
  const t = useTranslations();
  const back = pageBack(usePathname());
  if (!back) return null;

  return (
    <Link
      href={back.href}
      transitionTypes={["nav-back"]}
      aria-label={t("common.backTo", { page: t(back.labelKey as never) })}
      className={
        variant === "bar"
          ? "press -ml-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full md:hidden"
          : "press inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border-subtle hover:bg-surface-muted max-md:hidden"
      }
    >
      <ArrowLeftIcon className={variant === "bar" ? "h-6 w-6" : "h-5 w-5"} />
    </Link>
  );
}
