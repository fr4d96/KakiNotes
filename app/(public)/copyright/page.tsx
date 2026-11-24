import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LegalPage } from "@/components/legal-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal");
  return { title: t("copyrightTitle") };
}

export default async function CopyrightPage() {
  const t = await getTranslations("legal");
  return (
    <LegalPage title={t("copyrightTitle")} prefix="copyright" sections={4} />
  );
}
