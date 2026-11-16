import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

/**
 * China's default page description. The root layout's meta.siteDescription
 * talks about New Zealand Working Holiday Visa stories -- a New Zealand
 * term that must never describe a China page -- so any /cn page that sets
 * no description of its own (About, a profile without a bio) falls back to
 * China's instead. Renders nothing of its own.
 */
export async function generateMetadata(): Promise<Metadata> {
  const tCountry = await getTranslations("countryContent");
  return { description: tCountry("china.siteDescription") };
}

export default function ChinaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
