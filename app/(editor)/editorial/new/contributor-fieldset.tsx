"use client";

import { useState } from "react";
import type { ContributorForEditorial } from "@/lib/story/editorial-queries";
import type { ActiveCountry } from "@/lib/story/active-lookups";
import { DEFAULT_COUNTRY_SLUG } from "@/lib/story/countries";

/**
 * Title + "existing vs. new contributor" fields, factored out of
 * `new-import-form.tsx` (Stage 5, docs/pdf-import-plan.md) so the
 * blank-draft form and the new PDF-import form
 * (`pdf-import-picker.tsx`) render the exact same markup/`name` attributes
 * rather than two copies drifting apart. Both consumers read these fields
 * via `new FormData(formElement)` off a real `<form>` they own — this
 * component renders inputs only, no `<form>` of its own — and both submit
 * to code paths that parse them with the identical
 * `resolveContributorIdFromFormData()` helper
 * (app/(editor)/editorial/new/actions.ts), so validation can never diverge
 * between the two entry points.
 *
 * Also carries the Country select (2026-10-14, China): same reasoning --
 * a `<select name="country">` here is read by both consumers' own
 * `FormData` and re-validated identically by
 * `createEditorialImportAction`/the PDF-attach Route Handler
 * (`countrySlugSchema`), so an editor picks the country once regardless of
 * which import mode they use.
 */
export function TitleAndContributorFields({
  contributors,
  countries,
  locale,
  idPrefix,
}: {
  contributors: ContributorForEditorial[];
  /** Options for the Country select -- listActiveCountries(). */
  countries: ActiveCountry[];
  /** "zh-CN" shows each country's name_zh_cn when present; anything else
   * shows `name`. */
  locale: string;
  /** Distinguishes DOM ids between the two forms when both could
   * theoretically be mounted (they aren't, today, since the parent only
   * renders one mode at a time — but distinct ids are cheap insurance
   * against a future side-by-side layout). */
  idPrefix: string;
}) {
  const [mode, setMode] = useState<"existing" | "new">(
    contributors.length > 0 ? "existing" : "new",
  );

  return (
    <>
      <div>
        <label
          htmlFor={`${idPrefix}-title`}
          className="block text-sm font-medium"
        >
          Title
        </label>
        <input
          id={`${idPrefix}-title`}
          name="title"
          type="text"
          required
          maxLength={200}
          className="mt-1 w-full rounded-md border border-border-subtle px-3 py-2 dark:bg-transparent"
        />
      </div>

      <div>
        <label
          htmlFor={`${idPrefix}-country`}
          className="block text-sm font-medium"
        >
          Country
        </label>
        <select
          id={`${idPrefix}-country`}
          name="country"
          defaultValue={DEFAULT_COUNTRY_SLUG}
          className="mt-1 w-full rounded-md border border-border-subtle px-3 py-2 dark:bg-transparent"
        >
          {countries.map((c) => (
            <option key={c.id} value={c.slug}>
              {locale === "zh-CN" && c.name_zh_cn ? c.name_zh_cn : c.name}
            </option>
          ))}
        </select>
      </div>

      <fieldset>
        <legend className="text-sm font-medium">Contributor</legend>
        <div className="mt-1 flex gap-4 text-sm">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="contributorMode"
              value="existing"
              checked={mode === "existing"}
              onChange={() => setMode("existing")}
              disabled={contributors.length === 0}
            />
            Existing contributor
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="contributorMode"
              value="new"
              checked={mode === "new"}
              onChange={() => setMode("new")}
            />
            New (unlinked) contributor
          </label>
        </div>

        {mode === "existing" ? (
          <select
            name="existingContributorId"
            required
            className="mt-3 w-full rounded-md border border-border-subtle px-3 py-2 dark:bg-transparent"
          >
            {contributors.length === 0 && (
              <option value="">No contributors yet</option>
            )}
            {contributors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.displayName} {c.isLinked ? "(linked)" : "(unlinked)"}
              </option>
            ))}
          </select>
        ) : (
          <div className="mt-3 space-y-3">
            <div>
              <label
                htmlFor={`${idPrefix}-contributor-name`}
                className="block text-sm font-medium"
              >
                Display name
              </label>
              <input
                id={`${idPrefix}-contributor-name`}
                name="newContributorDisplayName"
                type="text"
                required
                maxLength={120}
                className="mt-1 w-full rounded-md border border-border-subtle px-3 py-2 dark:bg-transparent"
              />
            </div>
            <div>
              <label
                htmlFor={`${idPrefix}-contributor-attribution`}
                className="block text-sm font-medium"
              >
                Attribution type
              </label>
              <select
                id={`${idPrefix}-contributor-attribution`}
                name="newContributorAttributionType"
                defaultValue="display_name"
                className="mt-1 w-full rounded-md border border-border-subtle px-3 py-2 dark:bg-transparent"
              >
                <option value="real_name">Real name</option>
                <option value="display_name">Display name</option>
                <option value="pseudonym">Pseudonym</option>
                <option value="anonymous">Anonymous</option>
              </select>
            </div>
          </div>
        )}
      </fieldset>
    </>
  );
}
