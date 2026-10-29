import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BrandLogo } from "@/components/brand-logo";
import { PlaceholderPage } from "@/components/placeholder-page";

/**
 * China's about page uses the SAME structural component as ../../about/page.tsx
 * (PlaceholderPage) but China-framed copy from countryContent.china rather
 * than the WHV-specific p1/p2/p3 paragraphs in about.* -- product decision
 * 2: China is general travel, never WHV-framed.
 */

export async function generateMetadata(): Promise<Metadata> {
  const [t, tCountry] = await Promise.all([
    getTranslations("about"),
    getTranslations("countryContent"),
  ]);
  return { title: `${t("title")} — ${tCountry("china.name")}` };
}

export default async function ChinaAboutPage() {
  const [t, tCountry] = await Promise.all([
    getTranslations("about"),
    getTranslations("countryContent"),
  ]);
  return (
    <PlaceholderPage
      title={t("title")}
      icon={<BrandLogo className="h-14 w-14 border border-border-subtle" />}
    >
      <p>{tCountry("china.aboutText")}</p>
      <p>{tCountry("china.personalExperienceLabel")}</p>
    </PlaceholderPage>
  );
}
