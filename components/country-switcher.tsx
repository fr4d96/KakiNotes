"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { ChevronIcon } from "@/components/icons";
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
        // No outline: it reads as part of the name ("Kakinotes 🇳🇿⌄"), so
        // the bar isn't a row of boxes. -ml-1.5 pulls it toward the logo;
        // the padding keeps a 44px-tall tap target.
        className="press -ml-1.5 flex h-11 shrink-0 items-center gap-0.5 rounded-full px-1.5 hover:bg-surface-muted md:h-9"
      >
        <span aria-hidden="true" className="text-xl leading-none">
          {COUNTRY_FLAGS[current]}
        </span>
        <ChevronIcon
          aria-hidden="true"
          className="h-3.5 w-3.5 rotate-90 opacity-70"
        />
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
