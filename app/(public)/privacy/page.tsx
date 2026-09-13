import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PlaceholderPage } from "@/components/placeholder-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal");
  return { title: t("privacyTitle") };
}

export default async function PrivacyPage() {
  const t = await getTranslations("legal");
  return (
    <PlaceholderPage title={t("privacyTitle")}>
      <p>{t("privacyBody")}</p>
    </PlaceholderPage>
  );
}
