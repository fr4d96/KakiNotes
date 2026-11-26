import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

/**
 * Malaysia's default page description. The root layout's meta.siteDescription
 * talks about New Zealand Working Holiday Visa stories, which must never
 * describe a Malaysia page, so any /my page without a description of its own
 * falls back to Malaysia's. Renders nothing of its own.
 */
export async function generateMetadata(): Promise<Metadata> {
  const tCountry = await getTranslations("countryContent");
  return { description: tCountry("malaysia.siteDescription") };
}

export default function MalaysiaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
