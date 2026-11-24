import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LegalPage } from "@/components/legal-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal");
  return { title: t("termsTitle") };
}

export default async function TermsPage() {
  const t = await getTranslations("legal");
  return <LegalPage title={t("termsTitle")} prefix="terms" sections={5} />;
}
