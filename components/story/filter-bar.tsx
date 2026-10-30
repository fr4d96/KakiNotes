"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { StorySearchFilters } from "@/lib/validation/discovery";
import { costBands } from "@/lib/validation/discovery";
import { FilterIcon, StorySearchIcon } from "@/components/icons";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { useIsPhone } from "@/components/ui/use-is-phone";

// `name` is already localized by the page (lib/i18n/vocab.ts): these
// lookup rows carry a slug, so the closed regions/destinations vocabulary
// can be shown in the visitor's language while the VALUE submitted stays
// the row's uuid. Tags keep the contributor's own words, always.
type Option = { id: string; name: string };
type DestinationOption = Option & { regionId: string };

/** Typing pause before a live search runs, so it doesn't fire per letter. */
export const SEARCH_DEBOUNCE_MS = 300;

/**
 * The form's current values as URL params, empty ones dropped -- exactly
 * what a native GET submit would send, so a live search keeps every active
 * filter and (like a submit) carries no pagination cursor.
 */
function formParams(form: HTMLFormElement): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of new FormData(form)) {
    if (typeof value === "string" && value.trim() !== "") {
      params.set(key, key === "q" ? value.trim() : value);
    }
  }
  return params;
}

/**
 * Native GET <form> to /stories: works with JS disabled, and a submission
 * naturally omits cursorPublishedAt/cursorId (no hidden fields for them),
 * which is what resets pagination to the first page on every filter change
 * -- no extra "clear the cursor" logic needed. Collapses behind a toggle
 * button on small viewports, always visible at sm+ (design-brief
 * guidance) -- explicit state, not a native <details> (see the comment at
 * its render site for why).
 *
 * On phones (below md) the fields live in a bottom sheet
 * (components/ui/bottom-sheet.tsx) with Apply / Clear pinned at its foot;
 * from md up they stay inline with the Apply row beneath. Exactly one copy
 * of the fields exists at a time, and the sheet keeps them mounted while
 * closed, so a plain search-and-Enter still submits every active filter.
 * The sheet sits inside the <form> in the DOM, so Apply is an ordinary
 * submit button: same native GET, same params, same pagination reset.
 *
 * The search box also searches as you type (2026-10-30): after a short
 * pause it replaces the URL with the form's values (router.replace, no
 * scroll, no history entry per letter), and the server page re-renders the
 * results while the box keeps focus. The search icon becomes a spinner
 * while results load. It waits out IME composition, so Chinese input isn't
 * searched mid-word. Enter and Apply still submit the form as before.
 */
export function FilterBar({
  regions,
  destinations,
  tags,
  travelStyles,
  current,
}: {
  regions: Option[];
  destinations: DestinationOption[];
  tags: Option[];
  travelStyles: string[];
  current: StorySearchFilters;
}) {
  const t = useTranslations("stories.filters");
  const [selectedRegion, setSelectedRegion] = useState(current.region ?? "");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const isPhone = useIsPhone();
  const router = useRouter();
  const pathname = usePathname();
  const [searching, startSearch] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const debounce = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(debounce.current), []);

  function searchSoon() {
    window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => {
      const form = formRef.current;
      if (!form) return;
      const query = formParams(form).toString();
      const next = query ? `${pathname}?${query}` : pathname;
      startSearch(() => router.replace(next, { scroll: false }));
    }, SEARCH_DEBOUNCE_MS);
  }

  const visibleDestinations = selectedRegion
    ? destinations.filter((d) => d.regionId === selectedRegion)
    : destinations;

  const fields = (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{t("region")}</span>
        <select
          name="region"
          defaultValue={current.region ?? ""}
          onChange={(e) => setSelectedRegion(e.target.value)}
          className="min-h-11 rounded-md border border-border-subtle bg-surface px-3 py-2"
        >
          <option value="">{t("anyRegion")}</option>
          {regions.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{t("destination")}</span>
        <select
          name="destination"
          defaultValue={current.destination ?? ""}
          className="min-h-11 rounded-md border border-border-subtle bg-surface px-3 py-2"
        >
          <option value="">{t("anyDestination")}</option>
          {visibleDestinations.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{t("tag")}</span>
        <select
          name="tag"
          defaultValue={current.tag ?? ""}
          className="min-h-11 rounded-md border border-border-subtle bg-surface px-3 py-2"
        >
          <option value="">{t("anyTag")}</option>
          {tags.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{t("tripYear")}</span>
        <input
          type="number"
          name="tripYear"
          min={2000}
          max={2100}
          defaultValue={current.tripYear ?? ""}
          placeholder={t("anyYear")}
          className="min-h-11 rounded-md border border-border-subtle bg-surface px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{t("travelStyle")}</span>
        <select
          name="travelStyle"
          defaultValue={current.travelStyle ?? ""}
          className="min-h-11 rounded-md border border-border-subtle bg-surface px-3 py-2"
        >
          <option value="">{t("anyStyle")}</option>
          {travelStyles.map((style) => (
            <option key={style} value={style}>
              {style}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{t("reportedCost")}</span>
        <select
          name="costBand"
          defaultValue={current.costBand ?? ""}
          className="min-h-11 rounded-md border border-border-subtle bg-surface px-3 py-2"
        >
          <option value="">{t("anyCost")}</option>
          {costBands.map((band) => (
            <option key={band} value={band}>
              {t(`costBands.${band}`)}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{t("costAvailability")}</span>
        <select
          name="hasReportedExpense"
          defaultValue={
            current.hasReportedExpense === undefined
              ? ""
              : String(current.hasReportedExpense)
          }
          className="min-h-11 rounded-md border border-border-subtle bg-surface px-3 py-2"
        >
          <option value="">{t("anyStory")}</option>
          <option value="true">{t("hasReportedCost")}</option>
          <option value="false">{t("noReportedCost")}</option>
        </select>
      </label>
    </div>
  );

  return (
    <form
      ref={formRef}
      method="get"
      action="/stories"
      onSubmit={() => {
        window.clearTimeout(debounce.current);
        setFiltersOpen(false);
      }}
      className="rounded-xl border border-border-subtle bg-surface p-4 shadow-sm"
    >
      <label className="mb-4 flex flex-col gap-1 text-sm">
        <span className="font-medium">{t("search")}</span>
        <span className="relative">
          {searching ? (
            <span
              aria-hidden="true"
              data-testid="search-spinner"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-foreground/20 border-t-accent"
            />
          ) : (
            <StorySearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/50" />
          )}
          <input
            type="search"
            name="q"
            defaultValue={current.q ?? ""}
            placeholder={t("searchPlaceholder")}
            // Live search; IME composition (e.g. Chinese) waits for the
            // finished word, then the change after it searches.
            onChange={(e) => {
              if (!(e.nativeEvent as InputEvent).isComposing) searchSoon();
            }}
            onCompositionEnd={searchSoon}
            aria-busy={searching || undefined}
            className="min-h-11 w-full rounded-md border border-border-subtle bg-surface py-2 pl-9 pr-3"
          />
        </span>
      </label>

      {/*
        Explicit state, not a native <details> -- confirmed live (Playwright,
        real Chromium) that a closed <details>'s children stay hidden from
        both the accessibility tree and visual rendering even with a CSS
        `display: block !important` override on them. Below md this button
        opens the bottom sheet; from md up the fields are simply inline.
      */}
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={filtersOpen}
        onClick={() => setFiltersOpen(true)}
        className="press inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border-subtle px-4 text-sm font-medium transition-colors active:bg-surface-muted md:hidden"
      >
        <FilterIcon className="h-4 w-4" />
        {t("showFilters")}
      </button>

      {isPhone ? (
        <BottomSheet
          open={filtersOpen}
          onClose={() => setFiltersOpen(false)}
          title={t("showFilters")}
          keepMounted
          footer={
            <div className="flex gap-3">
              <button
                type="submit"
                className="press inline-flex min-h-12 flex-1 items-center justify-center rounded-full bg-accent px-5 text-sm font-black text-accent-foreground"
              >
                {t("apply")}
              </button>
              <Link
                href="/stories"
                onClick={() => setFiltersOpen(false)}
                className="press inline-flex min-h-12 items-center justify-center rounded-full border border-border-subtle px-5 text-sm font-bold"
              >
                {t("clear")}
              </Link>
            </div>
          }
        >
          <div className="px-2 pt-1 pb-2">{fields}</div>
        </BottomSheet>
      ) : (
        <>
          <div className="hidden md:block">{fields}</div>

          <div className="mt-4 hidden gap-3 md:flex">
            <button
              type="submit"
              className="inline-flex min-h-11 items-center rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
            >
              {t("apply")}
            </button>
            <Link
              href="/stories"
              className="inline-flex min-h-11 items-center rounded-md border border-border-subtle px-4 py-2 text-sm font-medium hover:bg-surface"
            >
              {t("clear")}
            </Link>
          </div>
        </>
      )}
    </form>
  );
}
