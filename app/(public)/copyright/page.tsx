import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PlaceholderPage } from "@/components/placeholder-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal");
  return { title: t("copyrightTitle") };
}

export default async function CopyrightPage() {
  const t = await getTranslations("legal");
  return (
    <PlaceholderPage title={t("copyrightTitle")}>
      <p>{t("copyrightBody")}</p>
    </PlaceholderPage>
  );
}
