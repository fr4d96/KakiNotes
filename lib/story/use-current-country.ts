"use client";

import { useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { countryForPath, type CountrySlug } from "@/lib/story/countries";
import {
  readRememberedCountry,
  subscribeNoop,
} from "@/lib/story/country-cookie";

/**
 * The country the header, tab bar and switcher should show: the page's own
 * (a /cn page is China, an NZ reader page is New Zealand) or, on pages that
 * belong to neither (My Stories, the editor, Account), the one remembered
 * on this device. On the server and the first client render it can't see
 * the cookie, so those pages start on New Zealand and settle a moment
 * later -- without a hydration mismatch (useSyncExternalStore).
 */
export function useCurrentCountry(): CountrySlug {
  const pathname = usePathname();
  const remembered = useSyncExternalStore(
    subscribeNoop,
    readRememberedCountry,
    () => null,
  );
  return countryForPath(pathname, remembered);
}
