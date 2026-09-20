import Link from "next/link";
import { useTranslations } from "next-intl";
import { BrandLogo } from "@/components/brand-logo";

export function SiteFooter() {
  const t = useTranslations("footer");
  const tNav = useTranslations("nav");
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
              href="/"
              className="flex items-center gap-2.5 text-xl font-black"
            >
              <BrandLogo className="border border-border-subtle" />
              Kakinotes
            </Link>
            <p className="mt-4 max-w-md text-sm text-muted-foreground">
              {t("tagline")}
            </p>
            <p className="mt-5 max-w-lg text-xs leading-5 text-foreground/65">
              {t("disclaimer")}
            </p>
          </div>
          <div>
            <strong>{t("explore")}</strong>
            <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
              <Link href="/stories">{tNav("stories")}</Link>
            </div>
          </div>
          <div>
            <strong>{t("community")}</strong>
            <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
              <Link href="/sign-up">{t("shareAStory")}</Link>
              <Link href="/contributors">{tNav("contributors")}</Link>
              <Link href="/about">{tNav("about")}</Link>
            </div>
          </div>
          <div>
            <strong>{t("support")}</strong>
            <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
              <Link href="/privacy">{t("privacy")}</Link>
              <Link href="/terms">{t("terms")}</Link>
              <Link href="/community-guidelines">{t("guidelines")}</Link>
              <Link href="/copyright">{t("copyrightRemoval")}</Link>
            </div>
          </div>
        </div>
        <div className="mt-10 flex flex-col gap-2 border-t border-border-subtle pt-5 text-xs text-foreground/65 sm:flex-row sm:justify-between">
          <span>{t("copyrightLine", { year: 2026 })}</span>
          <span>{t("madeFor")}</span>
        </div>
      </div>
    </footer>
  );
}
