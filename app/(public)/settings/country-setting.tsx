"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import {
  COUNTRY_FLAGS,
  COUNTRY_SLUGS,
  countryMessageSegment,
} from "@/lib/story/countries";
import { useCurrentCountry } from "@/lib/story/use-current-country";

/**
 * Settings → Country: which country's stories the app opens on, and where
 * a new story belongs (newStoryCountry). On phones this replaced the
 * header's flag switcher (2026-11-18); the desktop header keeps its flag.
 *
 * A plain form post to /country, like the flag and the first-visit picker,
 * so it works before JavaScript loads. `return=/settings` brings the reader
 * back here rather than to the country's home page. Only a preference: the
 * cookie it writes never decides access (see app/country/route.ts).
 */
export function CountrySetting() {
  const t = useTranslations("settings");
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="mt-8">
      <h2 className="px-1 text-sm font-bold text-muted-foreground">
        <span id={headingId}>{t("country")}</span>
      </h2>
      <p className="mt-1 px-1 text-sm text-muted-foreground">
        {t("countryHelp")}
      </p>
      <CountryPicker
        returnTo="/settings"
        className="mt-2 overflow-hidden rounded-2xl bg-surface shadow-sm"
      />
    </section>
  );
}

/**
 * The country list itself: one submit per country, posted to /country,
 * which comes back to `returnTo` (only /settings or /account are accepted
 * there, see app/country/route.ts).
 */
export function CountryPicker({
  returnTo,
  className,
}: {
  returnTo: "/settings" | "/account";
  className?: string;
}) {
  const tCountry = useTranslations("countryContent");
  const current = useCurrentCountry();
  return (
    <form method="post" action="/country" className={className}>
      <input type="hidden" name="return" value={returnTo} />
      {COUNTRY_SLUGS.map((slug, index) => {
        const selected = slug === current;
        return (
          <button
            key={slug}
            type="submit"
            name="country"
            value={slug}
            aria-pressed={selected}
            className={`press flex min-h-13 w-full items-center gap-3 px-4 text-left text-base font-medium hover:bg-surface-muted ${
              index > 0 ? "border-t border-border-subtle" : ""
            }`}
          >
            <span aria-hidden="true" className="text-2xl leading-none">
              {COUNTRY_FLAGS[slug]}
            </span>
            <span className="flex-1">
              {tCountry(`${countryMessageSegment(slug)}.name`)}
            </span>
            {selected ? (
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-5 w-5 text-accent"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12.5 10 17.5 19 7" />
              </svg>
            ) : null}
          </button>
        );
      })}
    </form>
  );
}
