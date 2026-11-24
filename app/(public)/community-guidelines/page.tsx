import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LegalPage } from "@/components/legal-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal");
  return { title: t("guidelinesTitle") };
}

export default async function CommunityGuidelinesPage() {
  const t = await getTranslations("legal");
  return (
    <LegalPage title={t("guidelinesTitle")} prefix="guidelines" sections={5} />
  );
}
