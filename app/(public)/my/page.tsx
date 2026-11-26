import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CountryHome } from "../_shared/country-home";

/**
 * Malaysia's home: the same page as New Zealand's (photo wall, places,
 * latest stories, trust points, quiz), every read scoped to Malaysia.
 */
export async function generateMetadata(): Promise<Metadata> {
  const tCountry = await getTranslations("countryContent");
  return {
    title: tCountry("malaysia.tagline"),
    description: tCountry("malaysia.siteDescription"),
  };
}

export default async function MalaysiaHomePage() {
  return CountryHome({ country: "malaysia" });
}
