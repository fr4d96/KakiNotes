"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { BrandLogo } from "@/components/brand-logo";
import { pageTitleKey } from "@/lib/navigation/page-titles";

/**
 * The left end of every reader/contributor header: the logo mark, then
 * either the Kakinotes wordmark or -- on phones, on a page listed in
 * lib/navigation/page-titles.ts -- that page's own title, the way an iOS
 * navigation bar names the screen you are on. It frees the page from
 * repeating its title as a big heading above the content.
 *
 * Decided from the pathname during render (server and client alike), so the
 * right title is in the first paint, with no "Kakinotes" flash, and it lives
 * in the header -- which holds still during page transitions -- rather than
 * sliding with the page.
 *
 * The bar's title is aria-hidden: the page keeps its real <h1> (visually
 * hidden on phones), so screen readers meet the title once, in the page. The
 * wordmark becomes sr-only rather than removed, so the logo link keeps its
 * accessible name.
 */
export function HeaderBrand({
  homeHref = "/",
  priority = false,
}: {
  homeHref?: string;
  priority?: boolean;
}) {
  const t = useTranslations();
  const key = pageTitleKey(usePathname());
  const title = key ? t(key as never) : null;

  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Link
        href={homeHref}
        className="flex min-h-11 shrink-0 items-center gap-2.5 text-xl font-black tracking-tight"
      >
        <BrandLogo className="border border-current" priority={priority} />
        <span className={title ? "max-md:sr-only" : undefined}>Kakinotes</span>
      </Link>
      {title && (
        <span
          aria-hidden="true"
          className="truncate text-xl font-black tracking-tight md:hidden"
        >
          {title}
        </span>
      )}
    </div>
  );
}
