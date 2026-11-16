"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import {
  COUNTRY_FLAGS,
  COUNTRY_SLUGS,
  countryMessageSegment,
} from "@/lib/story/countries";

/**
 * The first-visit country picker: shown over the home page until the reader
 * has chosen a country on this device (app/(public)/page.tsx decides). Two
 * big flag cards; each is a submit button of one plain form that posts to
 * /country, which remembers the choice and opens that country's home. So it
 * works before JavaScript loads.
 *
 * It sits OVER the home page rather than replacing it: crawlers never hold
 * the cookie, and they should still find the real home page in the HTML.
 * Once hydrated it behaves as a modal: everything behind it is made inert
 * (no focus, no screen-reader reading it), the page behind can't scroll,
 * and focus starts on the first country.
 */
export function CountryPicker() {
  const t = useTranslations("common.countryPicker");
  const tCountry = useTranslations("countryContent");
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    // Inert every sibling on the way up to <body>: the overlay lives inside
    // the page's own tree, so this is what makes it the only live content.
    const made: HTMLElement[] = [];
    for (
      let node: HTMLElement | null = overlay;
      node && node !== document.body;
      node = node.parentElement
    ) {
      for (const sibling of node.parentElement?.children ?? []) {
        if (
          sibling !== node &&
          sibling instanceof HTMLElement &&
          !sibling.inert
        ) {
          sibling.inert = true;
          made.push(sibling);
        }
      }
    }
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = "hidden";
    overlay.querySelector<HTMLButtonElement>("button")?.focus();
    return () => {
      for (const el of made) el.inert = false;
      root.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="country-picker-title"
      className="fixed inset-0 z-[60] flex flex-col justify-center overflow-y-auto bg-background px-5 pt-[calc(2rem+env(safe-area-inset-top))] pb-[calc(2rem+env(safe-area-inset-bottom))]"
    >
      <div className="mx-auto w-full max-w-md">
        <h2
          id="country-picker-title"
          className="text-[2rem] leading-tight font-extrabold tracking-[-.025em] text-balance"
        >
          {t("title")}
        </h2>
        <p className="mt-2 text-base text-foreground/70">{t("subtitle")}</p>

        <form
          method="post"
          action="/country"
          className="mt-8 flex flex-col gap-3"
        >
          {COUNTRY_SLUGS.map((slug) => {
            const segment = countryMessageSegment(slug);
            return (
              <button
                key={slug}
                type="submit"
                name="country"
                value={slug}
                className="press flex min-h-20 w-full items-center gap-4 rounded-2xl border border-border-subtle bg-surface px-4 py-4 text-left shadow-sm transition-colors hover:border-accent/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <span aria-hidden="true" className="text-4xl leading-none">
                  {COUNTRY_FLAGS[slug]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-bold">
                    {tCountry(`${segment}.name`)}
                  </span>
                  <span className="mt-0.5 block text-sm text-foreground/65">
                    {tCountry(`${segment}.tagline`)}
                  </span>
                </span>
              </button>
            );
          })}
        </form>

        <p className="mt-6 text-sm text-foreground/60">{t("switchLater")}</p>
      </div>
    </div>
  );
}
