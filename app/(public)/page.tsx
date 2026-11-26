import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CountryPicker } from "@/components/country-picker";
import {
  COUNTRY_COOKIE,
  countryFromCookieValue,
  countryUrlPrefix,
} from "@/lib/story/countries";
import { CountryHome } from "./_shared/country-home";

// The home tab shows the bare brand name. `absolute` skips the root layout's
// "%s | Kakinotes" template, which would otherwise read "Kakinotes | Kakinotes".
export const metadata: Metadata = {
  title: { absolute: "Kakinotes" },
};

/**
 * New Zealand's home, and the front door. The reader's country is
 * remembered on this device by POST /country: another country opens its own
 * home (/cn, /my); no choice yet shows the first-visit picker over this
 * page (still rendered underneath, for crawlers). The page itself is the
 * shared CountryHome (./_shared/country-home.tsx), which Malaysia reuses.
 */
export default async function HomePage() {
  const remembered = countryFromCookieValue(
    (await cookies()).get(COUNTRY_COOKIE)?.value,
  );
  const rememberedPrefix = remembered ? countryUrlPrefix(remembered) : "";
  if (rememberedPrefix) redirect(rememberedPrefix);
  // Called, not mounted, so the page's own result is the rendered tree
  // (an async Server Component can't be rendered by a test's client tree).
  return CountryHome({
    country: "new-zealand",
    overlay: remembered === null ? <CountryPicker /> : null,
  });
}
