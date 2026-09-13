"use client";

import { useActionState, useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  createOwnContributorAction,
  updateOwnContributorAction,
  type AccountFormState,
} from "@/app/(contributor)/actions";
import { contributorAttributionTypes } from "@/lib/validation/profile";
import { AvatarPicker } from "@/components/account/avatar-picker";
import { COUNTRY_OPTIONS } from "@/lib/countries";
import { formatCountryName } from "@/lib/i18n/format";
import { intlLocale, isLocale } from "@/i18n/locales";

const initialState: AccountFormState = {};

export function ContributorForm({
  existing,
}: {
  existing: {
    displayName: string;
    attributionType: string;
    publicProfileEnabled: boolean;
    publicSlug: string;
    bio: string;
    homeCountryCode: string;
    avatarEmoji: string;
  } | null;
}) {
  const t = useTranslations("account.contributor");
  const rawLocale = useLocale();
  const locale = isLocale(rawLocale) ? rawLocale : "en";
  // Sorted by the LOCALE's own collation, not by the English list's order:
  // a Chinese reader scanning a 250-row dropdown expects pinyin order, and
  // the English names' A-Z order tells them nothing.
  const countryOptions = useMemo(() => {
    const localized = COUNTRY_OPTIONS.map((country) => ({
      code: country.code,
      name:
        formatCountryName(country.code, locale, country.name) ?? country.name,
    }));
    if (locale === "en") return localized;
    const collator = new Intl.Collator(intlLocale(locale));
    return localized.sort((a, b) => collator.compare(a.name, b.name));
  }, [locale]);
  const action = existing
    ? updateOwnContributorAction
    : createOwnContributorAction;
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="mt-4 space-y-5" noValidate>
      <p className="rounded-md border border-border-subtle bg-surface-muted p-3 text-xs text-foreground/70">
        {t("intro")}
      </p>

      <AvatarPicker
        name="avatarEmoji"
        initial={existing?.avatarEmoji ?? ""}
        hint={t("avatarHint")}
      />

      <div>
        <label
          htmlFor="contributorDisplayName"
          className="block text-sm font-medium"
        >
          {t("nameLabel")}
        </label>
        <input
          id="contributorDisplayName"
          name="displayName"
          type="text"
          maxLength={120}
          required
          defaultValue={existing?.displayName ?? ""}
          className="mt-1 w-full rounded-xl border border-border-subtle bg-surface px-3 py-2 focus:border-accent focus:outline-none"
        />
      </div>

      <fieldset>
        <legend className="text-sm font-medium">
          {t("attributionLegend")}
        </legend>
        <div className="mt-2 space-y-2">
          {contributorAttributionTypes.map((type) => (
            <label key={type} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="attributionType"
                value={type}
                defaultChecked={
                  existing
                    ? existing.attributionType === type
                    : type === "display_name"
                }
                className="h-4 w-4 accent-accent"
              />
              {t(`attribution.${type}`)}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="contributorBio" className="block text-sm font-medium">
          {t("bioLabel")}
        </label>
        <p className="mt-1 text-xs text-foreground/55">{t("bioHint")}</p>
        <textarea
          id="contributorBio"
          name="bio"
          rows={4}
          maxLength={2000}
          defaultValue={existing?.bio ?? ""}
          className="mt-2 w-full rounded-xl border border-border-subtle bg-surface px-3 py-2 focus:border-accent focus:outline-none"
        />
      </div>

      <div>
        <label
          htmlFor="contributorHomeCountryCode"
          className="block text-sm font-medium"
        >
          {t("countryLabel")}
        </label>
        <p className="mt-1 text-xs text-foreground/55">{t("countryHint")}</p>
        <select
          id="contributorHomeCountryCode"
          name="homeCountryCode"
          defaultValue={existing?.homeCountryCode ?? ""}
          className="mt-2 w-full rounded-xl border border-border-subtle bg-surface px-3 py-2 focus:border-accent focus:outline-none"
        >
          <option value="">{t("countryUnset")}</option>
          {countryOptions.map((country) => (
            <option key={country.code} value={country.code}>
              {country.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <input
          id="contributorPublicProfileEnabled"
          name="publicProfileEnabled"
          type="checkbox"
          defaultChecked={existing?.publicProfileEnabled ?? false}
          className="h-4 w-4 accent-accent"
        />
        <label
          htmlFor="contributorPublicProfileEnabled"
          className="text-sm font-medium"
        >
          {t("listMe")}
        </label>
      </div>

      <div>
        <label
          htmlFor="contributorPublicSlug"
          className="block text-sm font-medium"
        >
          {t("slugLabel")}
        </label>
        <p className="mt-1 text-xs text-foreground/55">
          {/* Until 20260910090000 this paragraph existed to explain away a
              second, competing "public profile web address" on the Profile
              tab that no route ever resolved. That field is gone, so this
              now just says what the one remaining address does. */}
          {t("slugHintBefore")}{" "}
          <a
            href="/contributors"
            className="underline underline-offset-2"
            target="_blank"
            rel="noopener noreferrer"
          >
            /contributors
          </a>
          {t("slugHintAfter")}
        </p>
        <div className="mt-2 flex overflow-hidden rounded-xl border border-border-subtle focus-within:border-accent">
          <span className="flex items-center bg-surface-muted px-3 text-sm text-foreground/55">
            /contributors/
          </span>
          <input
            id="contributorPublicSlug"
            name="publicSlug"
            type="text"
            maxLength={60}
            defaultValue={existing?.publicSlug ?? ""}
            placeholder={t("slugPlaceholder")}
            className="w-full bg-surface px-3 py-2 focus:outline-none"
          />
        </div>
        <p className="mt-1 text-xs text-foreground/55">{t("slugHint2")}</p>
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="text-sm text-fern">
          {state.success}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="journiq-button bg-accent text-sm text-accent-foreground disabled:opacity-60"
      >
        {pending ? t("saving") : existing ? t("update") : t("create")}
      </button>
    </form>
  );
}
