"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import {
  COUNTRY_FLAGS,
  COUNTRY_SLUGS,
  countryMessageSegment,
  type CountrySlug,
} from "@/lib/story/countries";
import { useCurrentCountry } from "@/lib/story/use-current-country";

/**
 * The country switch in the top bar: the current country's flag, which
 * opens a sheet listing every country with its flag. Choosing one posts to
 * /country (remember it on this device, open its home), so it works as a
 * plain form. The current country is the page's own (a /cn page is China)
 * or, on pages that belong to neither (My Stories, the editor, Account),
 * the remembered one -- see countryForPath().
 */
export function CountrySwitcher() {
  const t = useTranslations("common.countrySwitcher");
  const tCountry = useTranslations("countryContent");
  const current = useCurrentCountry();
  const [open, setOpen] = useState(false);
  const name = (slug: CountrySlug) =>
    tCountry(`${countryMessageSegment(slug)}.name`);

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t("button", { country: name(current) })}
        title={t("button", { country: name(current) })}
        onClick={() => setOpen(true)}
        // Just the flag: no outline and no ⌄ chevron (dropped 2026-11-19,
        // it looked cluttered beside the bell), so the bar isn't a row of
        // boxes. The aria-label still says it changes the country, and a
        // round 44px tap target (36px from md) keeps it easy to hit.
        // -ml-1.5 pulls it toward the logo on desktop.
        className="press -ml-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-surface-muted md:h-9 md:w-9"
      >
        <span aria-hidden="true" className="text-xl leading-none">
          {COUNTRY_FLAGS[current]}
        </span>
      </button>

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title={t("sheetTitle")}
      >
        <form
          method="post"
          action="/country"
          className="flex flex-col gap-1 pb-1"
        >
          {COUNTRY_SLUGS.map((slug) => {
            const isCurrent = slug === current;
            return (
              <button
                key={slug}
                type="submit"
                name="country"
                value={slug}
                aria-current={isCurrent ? "true" : undefined}
                className={`press flex min-h-14 w-full items-center gap-3 rounded-xl px-3 text-left text-base font-medium hover:bg-surface-muted active:bg-surface-muted ${
                  isCurrent ? "bg-surface-muted" : ""
                }`}
              >
                <span aria-hidden="true" className="text-2xl leading-none">
                  {COUNTRY_FLAGS[slug]}
                </span>
                <span className="flex-1">{name(slug)}</span>
                {isCurrent ? (
                  <span aria-hidden="true" className="text-accent">
                    ✓
                  </span>
                ) : null}
              </button>
            );
          })}
        </form>
      </BottomSheet>
    </>
  );
}
