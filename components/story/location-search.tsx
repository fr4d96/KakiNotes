"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type {
  ActiveDestination,
  ActiveRegion,
} from "@/lib/story/active-lookups";

// OpenStreetMap Nominatim: free, no API key, no signup -- unlike Google
// Places this is a plain fetch to a public search endpoint, not an
// SDK/widget.
//
// THIS IS A GEOCODER, NOT AN AUTOCOMPLETE, and the difference is the whole
// reason this component works the way it does. /search matches whole place
// names; it does not do prefix matching. Typing "Queenstown" one character
// at a time returns, in order: nothing, nothing, six results for "Queens"
// (a high school, a road), nothing, nothing, and only then the town. So
// results appear and then VANISH as you keep typing a correct name.
//
// This used to fire on a 500ms debounce after the 3rd character, which meant
// a contributor typing a real place saw silence nearly the whole way -- and
// an empty result set rendered no dropdown and no message, so it read as
// broken rather than as "no match yet". Searching now happens only when the
// contributor asks for it (Enter, or the Search button), which is both what
// the endpoint can actually answer and what its usage policy
// (https://operations.osmfoundation.org/policies/nominatim/) requires: that
// policy names autocomplete/type-ahead as an unacceptable use of the public
// endpoint, regardless of debounce interval.
//
// The policy also asks for an identifying User-Agent or Referer. Browsers
// block scripts from setting a User-Agent, but the browser's own Referer
// (sent automatically, not spoofable by us) satisfies the same "identify
// your app" intent at this now-strictly-manual request volume.
const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";

/** Nominatim needs most of a name to match anything; below this it is guaranteed noise. */
const MIN_QUERY_LENGTH = 3;

type NominatimAddress = {
  city?: string;
  town?: string;
  village?: string;
  suburb?: string;
  state?: string;
  county?: string;
};
type NominatimResult = {
  place_id: number;
  display_name: string;
  address?: NominatimAddress;
};

/**
 * Suffixes Nominatim attaches to a Chinese province/municipality's `state`
 * field that the curated `regions` rows never carry -- "Guangdong Province"
 * geocodes, but the seeded region is named plain "Guangdong"
 * (supabase/migrations/20260924021909_countries.sql), and a municipality
 * like Beijing comes back as "Beijing Municipality"/"北京市" against a
 * region named "Beijing"/"北京". Stripped before comparison on BOTH sides
 * (a no-op for a name that never had the suffix, e.g. every NZ region), so
 * the same matcher works for every country without a per-country branch.
 */
const ENGLISH_ADMIN_SUFFIX = /\s*(province|municipality)\s*$/i;
const CHINESE_ADMIN_SUFFIX = /(省|市)$/;

function normalizePlaceName(raw: string): string {
  return raw
    .trim()
    .replace(ENGLISH_ADMIN_SUFFIX, "")
    .replace(CHINESE_ADMIN_SUFFIX, "")
    .trim();
}

/** Case/whitespace-insensitive equality, tolerant of a trailing province/municipality (or 省/市) suffix on either side. */
function namesMatch(a: string, b: string): boolean {
  return (
    normalizePlaceName(a).toLowerCase() === normalizePlaceName(b).toLowerCase()
  );
}

/** A lookup row matches a geocoded name if either its English or its Simplified Chinese name does. */
function rowNameMatches(
  row: { name: string; name_zh_cn: string | null },
  candidate: string,
): boolean {
  return (
    namesMatch(row.name, candidate) ||
    (row.name_zh_cn != null && namesMatch(row.name_zh_cn, candidate))
  );
}

async function searchNominatim(
  query: string,
  signal: AbortSignal,
  countryCode: string,
): Promise<NominatimResult[]> {
  const url = new URL(NOMINATIM_SEARCH_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "6");
  // Scoped to the story's selected country (countries.code, ISO 3166-1
  // alpha-2 -- exactly Nominatim's own `countrycodes` format) rather than a
  // hard-coded "nz": narrows results to wherever the contributor is
  // actually writing about, for every country this platform has.
  url.searchParams.set("countrycodes", countryCode);
  const res = await fetch(url.toString(), { signal });
  if (!res.ok) throw new Error(`Nominatim search failed: ${res.status}`);
  return res.json();
}

export function matchLocation(
  address: NominatimAddress | undefined,
  regions: ActiveRegion[],
  destinations: ActiveDestination[],
  /**
   * The first segment of the result's display_name -- i.e. the name of the
   * thing the contributor actually clicked. Preferred over the address
   * object's locality fields for LABELLING, because those can be broader
   * than the pick: choosing "Kaikohe" returns an address whose most
   * specific locality field is "Kaikohe-Hokianga Community", which is
   * accurate, unhelpful, and not what anyone typed. Matching still uses the
   * address fields, which are the structured, reliable half.
   */
  primaryName?: string,
): {
  regionId: string;
  destinationId: string | null;
  customDestinationLabel: string | null;
} | null {
  const localityName =
    address?.city ?? address?.town ?? address?.village ?? address?.suburb;
  const regionName = address?.state ?? address?.county;

  const matchedDestination = localityName
    ? destinations.find((d) => rowNameMatches(d, localityName))
    : undefined;
  const matchedRegion = matchedDestination
    ? regions.find((r) => r.id === matchedDestination.regionId)
    : regionName
      ? regions.find((r) => rowNameMatches(r, regionName))
      : undefined;

  if (!matchedRegion) return null;
  return {
    regionId: matchedRegion.id,
    destinationId: matchedDestination?.id ?? null,
    // The map FOUND the place -- it just is not one of the 34 seeded
    // `destinations` rows. Keeping the name it returned is the difference
    // between recording "Northland" and recording "Kaikohe, Northland".
    // Before this, that name was thrown away and 10 of the 13 location rows
    // in the database ended up region-only as a result.
    customDestinationLabel: matchedDestination
      ? null
      : (primaryName ?? localityName ?? null),
  };
}

export type LocationMatch = {
  regionId: string;
  destinationId: string | null;
  /** The map's own name for a place that is not a `destinations` row. */
  customDestinationLabel: string | null;
  label: string;
};

export type LocationSearchProps = {
  regions: ActiveRegion[];
  destinations: ActiveDestination[];
  onMatch: (match: LocationMatch | null, searchedLabel: string) => void;
  /** The selected country's `countries.code` (ISO 3166-1 alpha-2) -- scopes the Nominatim search. */
  countryCode: string;
  /** The selected country's `countryContent.<segment>.placeExample` -- the placeholder's "e.g. ..." town name. */
  placeholderExample: string;
};

/**
 * Free-text place search for picking a story location, backed by
 * OpenStreetMap's Nominatim (no API key). Deliberately does not store
 * arbitrary place data (lat/lng/osm id) -- story_revision_locations only
 * ever stores FK references into the regions/destinations lookup tables
 * (see supabase/migrations/20260803090300_story_revision_relations.sql), so
 * a selected result is matched back to the closest existing region (by
 * state/county) and destination (by city/town/village) row by name. If
 * nothing matches, onMatch(null, ...) tells the caller to fall back to the
 * manual dropdowns below.
 */
export function LocationSearch({
  regions,
  destinations,
  onMatch,
  countryCode,
  placeholderExample,
}: LocationSearchProps) {
  const t = useTranslations("editor.place");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [open, setOpen] = useState(false);
  // "empty" and "too-short" exist because silence was the actual bug: a
  // successful search that matched nothing rendered no dropdown and no
  // message at all, which is indistinguishable from a broken feature.
  const [status, setStatus] = useState<
    "idle" | "searching" | "error" | "empty" | "too-short"
  >("idle");
  /** What the last search actually asked for, so the empty state can quote it. */
  const [searchedTerm, setSearchedTerm] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputId = useId();

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // Typing only edits the box now. Any previous verdict is cleared so a
  // stale "no places matched" can't sit under a query it no longer describes.
  function handleQueryChange(value: string) {
    setQuery(value);
    setOpen(false);
    if (status !== "idle") setStatus("idle");
  }

  async function runSearch() {
    const trimmed = query.trim();
    abortRef.current?.abort();

    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setOpen(false);
      setStatus("too-short");
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setStatus("searching");
    setSearchedTerm(trimmed);

    try {
      const data = await searchNominatim(
        trimmed,
        controller.signal,
        countryCode,
      );
      setResults(data);
      setOpen(data.length > 0);
      setStatus(data.length > 0 ? "idle" : "empty");
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setResults([]);
      setOpen(false);
      setStatus("error");
    }
  }

  function handleSelect(result: NominatimResult) {
    const label = result.display_name.trim();
    setQuery(label);
    setOpen(false);
    setStatus("idle");
    const match = matchLocation(
      result.address,
      regions,
      destinations,
      label.split(",")[0]?.trim() || undefined,
    );
    onMatch(match ? { ...match, label } : null, label);
  }

  return (
    <div ref={containerRef} className="relative">
      <label htmlFor={inputId} className="sr-only">
        {t("heading")}
      </label>
      <div className="flex gap-2">
        <input
          id={inputId}
          type="text"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          // Enter searches rather than doing nothing, because a search box
          // that ignores Enter is its own small bug. There is no <form>
          // around this (story-edit-form.tsx saves through its own mutation
          // queue), so preventDefault is belt-and-braces against a future one
          // turning this into an accidental submit.
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void runSearch();
            }
          }}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={t("placeholder", { example: placeholderExample })}
          autoComplete="off"
          className="w-full flex-1 rounded-md border border-border-subtle px-3 py-2 text-sm dark:bg-transparent"
        />
        <button
          type="button"
          onClick={() => void runSearch()}
          disabled={status === "searching"}
          className="shrink-0 rounded-md border border-border-subtle px-3 py-2 text-sm font-medium hover:bg-surface-muted disabled:opacity-50"
        >
          {status === "searching" ? t("searching") : t("search")}
        </button>
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-10 mt-1 w-full rounded-md border border-border-subtle bg-surface text-sm shadow-lg">
          <ul>
            {results.map((result) => (
              <li key={result.place_id}>
                <button
                  type="button"
                  onClick={() => handleSelect(result)}
                  className="block w-full truncate px-3 py-2 text-left hover:bg-surface-muted"
                  title={result.display_name}
                >
                  {result.display_name}
                </button>
              </li>
            ))}
          </ul>
          {/* Attribution required by Nominatim's usage policy; scoped to when
              OSM results are on screen rather than shown permanently. */}
          <p className="border-t border-border-subtle px-3 py-1 text-[11px] text-muted-foreground/70">
            {t("attributionBefore")}{" "}
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              OpenStreetMap
            </a>{" "}
            {t("attributionAfter")}
          </p>
        </div>
      )}
      {/* Every non-idle outcome says something. The map returning no match is
          a normal answer, not a failure, so it reads as information and
          names the recovery -- the manual dropdowns are right below. */}
      {status === "too-short" && (
        <p role="status" className="mt-1 text-xs text-muted-foreground">
          {t("tooShort", { min: MIN_QUERY_LENGTH })}
        </p>
      )}
      {status === "empty" && (
        <p role="status" className="mt-1 text-xs text-muted-foreground">
          {t("noMatches", { term: searchedTerm })}
        </p>
      )}
      {status === "error" && (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {t("unavailable")}
        </p>
      )}
    </div>
  );
}
