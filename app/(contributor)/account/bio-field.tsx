"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { BIO_MAX_LENGTH } from "@/lib/validation/profile";

/**
 * The contributor bio: plain text, line breaks kept, capped at
 * BIO_MAX_LENGTH with a live count. Still a normal named form field
 * (`bio`), so ContributorForm's Server Action reads it from FormData
 * exactly as before; the state here only drives the counter.
 *
 * The count reads `value.length` in the browser, which sees a line break as
 * one character. The schema normalises the CRLF a submitted textarea sends
 * back to LF before checking the cap, so the two always agree.
 */
export function BioField({ defaultValue }: { defaultValue: string }) {
  const t = useTranslations("account.contributor");
  const [value, setValue] = useState(defaultValue);
  const count = value.length;
  const over = count > BIO_MAX_LENGTH;

  return (
    <div>
      <label htmlFor="contributorBio" className="block text-sm font-medium">
        {t("bioLabel")}
      </label>
      <p id="contributorBioHint" className="mt-1 text-xs text-foreground/55">
        {t("bioHint", { max: BIO_MAX_LENGTH })}
      </p>
      <textarea
        id="contributorBio"
        name="bio"
        rows={4}
        // No maxLength: it would silently stop typing, and a bio saved
        // before the cap tightened could not be shown in full to trim. The
        // counter turns red instead, and the schema rejects it on save.
        value={value}
        onChange={(event) => setValue(event.target.value)}
        aria-describedby="contributorBioHint contributorBioCount"
        aria-invalid={over || undefined}
        className={`mt-2 w-full rounded-xl border bg-surface px-3 py-2 focus:outline-none ${
          over
            ? "border-destructive"
            : "border-border-subtle focus:border-accent"
        }`}
      />
      <p
        id="contributorBioCount"
        // Polite and atomic so a screen reader hears the count when it
        // settles, not on every keystroke mid-word.
        aria-live="polite"
        aria-atomic="true"
        className={`mt-1 text-right text-xs tabular-nums ${
          over ? "font-medium text-destructive" : "text-foreground/55"
        }`}
      >
        {t("bioCount", { count, max: BIO_MAX_LENGTH })}
      </p>
    </div>
  );
}
