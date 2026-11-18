"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { BrandLogo } from "@/components/brand-logo";
import { BackLink } from "@/components/back-link";
import { pageBack, pageBarTitleKey } from "@/lib/navigation/page-titles";

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
  const pathname = usePathname();
  // The bar's own (sometimes shorter) label for the page -- see
  // BAR_TITLE_KEYS in lib/navigation/page-titles.ts.
  const key = pageBarTitleKey(pathname);
  const title = key ? t(key as never) : null;
  // A sub-page puts a back arrow first. Where the bar names the page, the
  // arrow replaces the logo on phones ([←] Story folders); on a story's
  // pages (no bar title) the logo stays beside it ([←] logo).
  const hasBack = pageBack(pathname) !== null;
  // A story's pages, iOS-style: once the page's own big title scrolls up
  // under the bar, the bar shows it, so the reader always knows where they
  // are (2026-11-18 -- the bar was a lone arrow and logo there).
  const scrolledTitle = usePageTitleOnScroll(hasBack && !title, pathname);

  return (
    <div className="flex min-w-0 items-center gap-2.5">
      {hasBack && <BackLink variant="bar" />}
      <Link
        href={homeHref}
        className={`flex min-h-11 shrink-0 items-center gap-2.5 text-xl font-black tracking-tight ${
          (hasBack && title) || scrolledTitle ? "max-md:hidden" : ""
        }`}
      >
        <BrandLogo className="border border-current" priority={priority} />
        {/* Beside a back arrow (a story's pages) the word fits again since
            the flag moved to Settings on phones: [←] [logo] Kakinotes. */}
        <span className={title ? "max-md:sr-only" : undefined}>Kakinotes</span>
      </Link>
      {scrolledTitle && (
        // The page's h1 is still the heading; this is a visual echo only.
        <span
          aria-hidden="true"
          className="nf-bar-title truncate text-lg font-bold tracking-tight md:hidden"
        >
          {scrolledTitle}
        </span>
      )}
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

/**
 * The text of the page's main heading (`main h1`) while it is scrolled up
 * under the sticky header, else null. Off when `enabled` is false.
 *
 * Checked on scroll (one read per frame) and found afresh each time, not
 * observed once: the header outlives the page, and on a tap into a story
 * its effect runs before the story's h1 has streamed in, so a one-off
 * lookup found nothing and never looked again.
 */
function usePageTitleOnScroll(
  enabled: boolean,
  pathname: string | null,
): string | null {
  const [hidden, setHidden] = useState<{ path: string; text: string } | null>(
    null,
  );

  useEffect(() => {
    if (!enabled) return;
    const path = pathname ?? "";
    let frame = 0;
    const check = () => {
      frame = 0;
      const heading = document.querySelector("main h1");
      const text = heading?.textContent?.trim();
      const header = document.querySelector("header");
      const under = header ? header.getBoundingClientRect().bottom : 0;
      const gone =
        !!heading && !!text && heading.getBoundingClientRect().bottom <= under;
      setHidden((previous) =>
        gone
          ? previous?.path === path && previous.text === text
            ? previous
            : { path, text: text! }
          : previous === null
            ? previous
            : null,
      );
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    check();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [enabled, pathname]);

  // A title remembered from the previous page never shows on this one.
  return enabled && hidden && hidden.path === (pathname ?? "")
    ? hidden.text
    : null;
}
