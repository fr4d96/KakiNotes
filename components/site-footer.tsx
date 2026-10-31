"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { BrandLogo } from "@/components/brand-logo";
import { countryFromPathname, countryUrlPrefix } from "@/lib/story/countries";

// A link in the phone row: inline, with a 44px tap height (min-h-11) because
// the row is touch-first; a plain stacked link from md up.
const footerLink = "inline-flex min-h-11 items-center md:block md:min-h-0";

// A client component only for usePathname(): the footer sits in the shared
// (public) layout, so the URL is the one place it can learn which country
// section it is under -- and whether this is a home page at all.
//
// Home pages only (/ and /cn). Everywhere else the bottom tab bar and the
// header carry the navigation, and a full footer under every list, form and
// story was a long scroll of links nobody came for. Rendered from the
// (public) layout rather than the home page itself so it stays outside
// <main> and keeps its contentinfo landmark. The other layouts (auth,
// contributor, staff) never show a home page, so they don't render it.
export function SiteFooter() {
  const t = useTranslations("footer");
  const tNav = useTranslations("nav");
  const tChina = useTranslations("countryContent.china");
  const pathname = usePathname() ?? "/";
  const isChina = countryFromPathname(pathname) === "china";
  const prefix = isChina ? countryUrlPrefix("china") : "";
  const rest = pathname.slice(prefix.length).replace(/\/+$/, "");
  if (rest !== "") return null;
  return (
    // The footer FLIPS with the theme; it is not an always-dark band.
    //
    // It used to be `bg-forest text-white` in both renditions. Two problems in
    // light mode: it sat directly under the .journiq-share band (itself
    // always dark), so the page ended on ~1400px of unbroken dark after a
    // warm off-white body; and light `--forest` was #17110d, a warm brown-black
    // left over from the retired Field Journal palette, butting against
    // .journiq-share's cool rgba(2, 4, 6) -- two different blacks touching.
    //
    // Reading the ordinary surface tokens ends the page on the same paper it
    // started on, and leaves .journiq-share as the page's single dark band,
    // which is what makes the contribute CTA the emphatic beat it is meant to
    // be. Dark mode is unaffected in character: --surface there is #0b1222.
    //
    // Two shapes, one markup (DESIGN.md's Two Shapes Rule). On phones the
    // footer is slim: the disclaimer, ONE wrapped row of About + the four
    // legal links, and the copyright line. Everything else here repeats what
    // the header, the bottom tab bar or the home page already offer (logo,
    // tagline, Stories, Share a story, Contributors), so it is md-only. From
    // md up it is the full four-column footer. The phone row is built with
    // `contents`: the link-row wrapper and each column dissolve on phones so
    // their links become items of one flex row, and the wrapper dissolves on
    // md so the columns drop back into the four-column grid. The links are
    // never duplicated per breakpoint.
    <footer
      id="about"
      className="border-t border-border-subtle bg-surface text-foreground"
    >
      <div className="mx-auto max-w-[1440px] px-4 py-7 sm:px-6 md:py-16">
        <div className="md:grid md:grid-cols-[1.4fr_.7fr_.7fr_.7fr] md:gap-10">
          <div>
            <Link
              href={prefix || "/"}
              className="hidden min-h-11 items-center gap-2.5 text-xl font-black md:flex"
            >
              <BrandLogo className="border border-border-subtle" />
              Kakinotes
            </Link>
            <p className="mt-4 hidden max-w-md text-sm text-muted-foreground md:block">
              {isChina ? tChina("tagline") : t("tagline")}
            </p>
            <p className="max-w-lg text-xs leading-5 text-foreground/65 md:mt-5">
              {t("disclaimer")}
            </p>
          </div>
          <div className="hidden md:block">
            <strong>{t("explore")}</strong>
            <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
              <Link href={`${prefix}/stories`}>{tNav("stories")}</Link>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-5 text-sm text-muted-foreground md:contents">
            <div className="contents md:block">
              <strong className="hidden text-foreground md:block">
                {t("community")}
              </strong>
              <div className="contents md:mt-3 md:grid md:gap-2">
                <Link href="/sign-up" className="hidden md:block">
                  {t("shareAStory")}
                </Link>
                <Link
                  href={`${prefix}/contributors`}
                  className="hidden md:block"
                >
                  {tNav("contributors")}
                </Link>
                <Link href={`${prefix}/about`} className={footerLink}>
                  {tNav("about")}
                </Link>
              </div>
            </div>
            <div className="contents md:block">
              <strong className="hidden text-foreground md:block">
                {t("support")}
              </strong>
              <div className="contents md:mt-3 md:grid md:gap-2">
                <Link href="/privacy" className={footerLink}>
                  {t("privacy")}
                </Link>
                <Link href="/terms" className={footerLink}>
                  {t("terms")}
                </Link>
                <Link href="/community-guidelines" className={footerLink}>
                  {t("guidelines")}
                </Link>
                <Link href="/copyright" className={footerLink}>
                  {t("copyrightRemoval")}
                </Link>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-2 flex flex-col gap-2 text-xs text-foreground/65 md:mt-10 md:flex-row md:justify-between md:border-t md:border-border-subtle md:pt-5">
          <span>{t("copyrightLine", { year: 2026 })}</span>
          <span className="hidden md:inline">
            {isChina ? tChina("madeFor") : t("madeFor")}
          </span>
        </div>
      </div>
    </footer>
  );
}
