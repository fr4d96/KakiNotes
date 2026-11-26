import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BrandLogo } from "@/components/brand-logo";
import { PlaceholderPage } from "@/components/placeholder-page";

/**
 * Malaysia's about page: the same structure as China's (PlaceholderPage),
 * with Malaysia-framed copy -- general travel and living, never WHV.
 */

export async function generateMetadata(): Promise<Metadata> {
  const [t, tCountry] = await Promise.all([
    getTranslations("about"),
    getTranslations("countryContent"),
  ]);
  return { title: `${t("title")} — ${tCountry("malaysia.name")}` };
}

export default async function MalaysiaAboutPage() {
  const [t, tCountry] = await Promise.all([
    getTranslations("about"),
    getTranslations("countryContent"),
  ]);
  return (
    <PlaceholderPage
      title={t("title")}
      icon={<BrandLogo className="h-14 w-14 border border-border-subtle" />}
    >
      <p>{tCountry("malaysia.aboutText")}</p>
      <p>{tCountry("malaysia.personalExperienceLabel")}</p>
    </PlaceholderPage>
  );
}
