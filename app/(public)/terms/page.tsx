import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PlaceholderPage } from "@/components/placeholder-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal");
  return { title: t("termsTitle") };
}

export default async function TermsPage() {
  const t = await getTranslations("legal");
  return (
    <PlaceholderPage title={t("termsTitle")}>
      <p>{t("termsBody")}</p>
    </PlaceholderPage>
  );
}
