"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { BrandLogo } from "@/components/brand-logo";
import { countryFromPathname, countryUrlPrefix } from "@/lib/story/countries";

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
    <footer
      id="about"
      className="border-t border-border-subtle bg-surface text-foreground"
    >
      <div className="mx-auto max-w-[1440px] px-4 py-16 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1.4fr_.7fr_.7fr_.7fr]">
          <div>
            <Link
              href={prefix || "/"}
              className="flex min-h-11 items-center gap-2.5 text-xl font-black"
            >
              <BrandLogo className="border border-border-subtle" />
              Kakinotes
            </Link>
            <p className="mt-4 max-w-md text-sm text-muted-foreground">
              {isChina ? tChina("tagline") : t("tagline")}
            </p>
            <p className="mt-5 max-w-lg text-xs leading-5 text-foreground/65">
              {t("disclaimer")}
            </p>
          </div>
          <div>
            <strong>{t("explore")}</strong>
            <div className="mt-3 grid gap-0 text-sm md:gap-2 text-muted-foreground">
              <Link href={`${prefix}/stories`} className="py-3 md:py-0">
                {tNav("stories")}
              </Link>
            </div>
          </div>
          <div>
            <strong>{t("community")}</strong>
            <div className="mt-3 grid gap-0 text-sm md:gap-2 text-muted-foreground">
              <Link href="/sign-up" className="py-3 md:py-0">
                {t("shareAStory")}
              </Link>
              <Link href={`${prefix}/contributors`} className="py-3 md:py-0">
                {tNav("contributors")}
              </Link>
              <Link href={`${prefix}/about`} className="py-3 md:py-0">
                {tNav("about")}
              </Link>
            </div>
          </div>
          <div>
            <strong>{t("support")}</strong>
            <div className="mt-3 grid gap-0 text-sm md:gap-2 text-muted-foreground">
              <Link href="/privacy" className="py-3 md:py-0">
                {t("privacy")}
              </Link>
              <Link href="/terms" className="py-3 md:py-0">
                {t("terms")}
              </Link>
              <Link href="/community-guidelines" className="py-3 md:py-0">
                {t("guidelines")}
              </Link>
              <Link href="/copyright" className="py-3 md:py-0">
                {t("copyrightRemoval")}
              </Link>
            </div>
          </div>
        </div>
        <div className="mt-10 flex flex-col gap-2 border-t border-border-subtle pt-5 text-xs text-foreground/65 sm:flex-row sm:justify-between">
          <span>{t("copyrightLine", { year: 2026 })}</span>
          <span>{isChina ? tChina("madeFor") : t("madeFor")}</span>
        </div>
      </div>
    </footer>
  );
}
