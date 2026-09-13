import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BrandLogo } from "@/components/brand-logo";
import { PlaceholderPage } from "@/components/placeholder-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("about");
  return { title: t("metaTitle") };
}

export default async function AboutPage() {
  const t = await getTranslations("about");
  return (
    <PlaceholderPage
      title={t("title")}
      icon={<BrandLogo className="h-14 w-14 border border-border-subtle" />}
    >
      <p>{t("p1")}</p>
      <p>{t("p2")}</p>
      <p>{t("p3")}</p>
    </PlaceholderPage>
  );
}
