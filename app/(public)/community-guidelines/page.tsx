import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PlaceholderPage } from "@/components/placeholder-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal");
  return { title: t("guidelinesTitle") };
}

export default async function CommunityGuidelinesPage() {
  const t = await getTranslations("legal");
  return (
    <PlaceholderPage title={t("guidelinesTitle")}>
      <p>{t("guidelinesBody")}</p>
    </PlaceholderPage>
  );
}
