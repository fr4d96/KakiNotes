"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { StorySearchFilters } from "@/lib/validation/discovery";
import { costBands } from "@/lib/validation/discovery";
import { FilterIcon, StorySearchIcon } from "@/components/icons";

// `name` is already localized by the page (lib/i18n/vocab.ts): these
// lookup rows carry a slug, so the closed regions/destinations vocabulary
// can be shown in the visitor's language while the VALUE submitted stays
// the row's uuid. Tags keep the contributor's own words, always.
type Option = { id: string; name: string };
type DestinationOption = Option & { regionId: string };

/**
 * Native GET <form> to /stories: works with JS disabled, and a submission
 * naturally omits cursorPublishedAt/cursorId (no hidden fields for them),
 * which is what resets pagination to the first page on every filter change
 * -- no extra "clear the cursor" logic needed. Collapses behind a toggle
 * button on small viewports, always visible at sm+ (design-brief
 * guidance) -- explicit state, not a native <details> (see the comment at
 * its render site for why).
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
  const filtersId = useId();
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
          className="rounded-md border border-border-subtle bg-surface px-3 py-2"
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
          className="rounded-md border border-border-subtle bg-surface px-3 py-2"
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
          className="rounded-md border border-border-subtle bg-surface px-3 py-2"
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
          className="rounded-md border border-border-subtle bg-surface px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{t("travelStyle")}</span>
        <select
          name="travelStyle"
          defaultValue={current.travelStyle ?? ""}
          className="rounded-md border border-border-subtle bg-surface px-3 py-2"
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
          className="rounded-md border border-border-subtle bg-surface px-3 py-2"
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
          className="rounded-md border border-border-subtle bg-surface px-3 py-2"
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
      method="get"
      action="/stories"
      className="rounded-xl border border-border-subtle bg-surface p-4 shadow-sm"
    >
      <label className="mb-4 flex flex-col gap-1 text-sm">
        <span className="font-medium">{t("search")}</span>
        <span className="relative">
          <StorySearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/50" />
          <input
            type="search"
            name="q"
            defaultValue={current.q ?? ""}
            placeholder={t("searchPlaceholder")}
            className="w-full rounded-md border border-border-subtle bg-surface py-2 pl-9 pr-3"
          />
        </span>
      </label>

      {/*
        Explicit state, not a native <details> -- confirmed live (Playwright,
        real Chromium) that a closed <details>'s children stay hidden from
        both the accessibility tree and visual rendering even with a CSS
        `display: block !important` override on them; a plain conditional
        class is what mobile-nav-toggle.tsx already uses for the same
        "collapsed on mobile, always visible on desktop" shape.
      */}
      <button
        type="button"
        aria-expanded={filtersOpen}
        aria-controls={filtersId}
        onClick={() => setFiltersOpen((value) => !value)}
        className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium sm:hidden"
      >
        <FilterIcon className="h-4 w-4" />
        {filtersOpen ? t("hideFilters") : t("showFilters")}
      </button>
      <div id={filtersId} className={filtersOpen ? "block" : "hidden sm:block"}>
        {fields}
      </div>

      <div className="mt-4 flex gap-3">
        <button
          type="submit"
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
        >
          {t("apply")}
        </button>
        <Link
          href="/stories"
          className="rounded-md border border-border-subtle px-4 py-2 text-sm font-medium hover:bg-surface"
        >
          {t("clear")}
        </Link>
      </div>
    </form>
  );
}
