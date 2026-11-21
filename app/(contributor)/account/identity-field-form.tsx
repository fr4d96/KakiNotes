"use client";

import { useActionState, useEffect, useEffectEvent, useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  updateOwnContributorAction,
  type AccountFormState,
} from "@/app/(contributor)/actions";
import { BioField } from "@/app/(contributor)/account/bio-field";
import { RowActions } from "@/components/you/disclosure-row";
import { COUNTRY_OPTIONS } from "@/lib/countries";
import { formatCountryName } from "@/lib/i18n/format";
import { intlLocale, isLocale, type Locale } from "@/i18n/locales";

export type ContributorIdentity = {
  displayName: string;
  attributionType: string;
  publicProfileEnabled: boolean;
  publicSlug: string;
  bio: string;
  homeCountryCode: string;
};

export type IdentityField = "name" | "bio" | "country" | "slug";

const initialState: AccountFormState = {};

const FIELD_CLASS =
  "w-full rounded-[10px] border border-border-subtle bg-background px-3 py-2.5 text-base focus:border-accent focus:outline-none";

/**
 * One field of the contributor identity, edited in its own row.
 *
 * The server action (updateOwnContributorAction) still takes the whole
 * identity and validates the whole of it, exactly as the old one-big-form
 * did: this form posts the edited field from its control and every OTHER
 * field from hidden inputs carrying the values the server just rendered.
 * Nothing is trusted from those hidden values that wasn't already trusted
 * from the old form (the action re-validates and RLS scopes the write to
 * the caller's own row), and no field can be cleared by accident by saving
 * a different one.
 */
export function IdentityFieldForm({
  field,
  identity,
  onDone,
}: {
  field: IdentityField;
  identity: ContributorIdentity;
  onDone: () => void;
}) {
  const t = useTranslations("account.contributor");
  const tYou = useTranslations("account.you");
  const [state, formAction, pending] = useActionState(
    updateOwnContributorAction,
    initialState,
  );

  // Fold the row once the save lands (the action revalidates /account, so
  // the row's value is already the new one when it closes).
  const finish = useEffectEvent(() => onDone());
  useEffect(() => {
    if (state.success) finish();
  }, [state]);

  const hidden = (name: string, value: string) => (
    <input type="hidden" name={name} value={value} />
  );

  return (
    <form action={formAction} noValidate>
      {field !== "name" && hidden("displayName", identity.displayName)}
      {/* Not editable here any more: new identities are credited by
          display name, and an existing choice is carried over unchanged
          (switching an anonymous writer to a named credit would publish
          their name without asking). */}
      {hidden("attributionType", identity.attributionType)}
      {field !== "bio" && hidden("bio", identity.bio)}
      {field !== "country" &&
        hidden("homeCountryCode", identity.homeCountryCode)}
      {field !== "slug" && hidden("publicSlug", identity.publicSlug)}

      {field === "name" && <NameField defaultValue={identity.displayName} />}
      {field === "bio" && <BioField defaultValue={identity.bio} />}
      {field === "country" && (
        <CountryField defaultValue={identity.homeCountryCode} />
      )}
      {field === "slug" && <SlugField defaultValue={identity.publicSlug} />}

      {state.error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {state.error}
        </p>
      )}

      <RowActions
        pending={pending}
        saveLabel={tYou("save")}
        savingLabel={t("saving")}
        cancelLabel={tYou("cancel")}
        onCancel={onDone}
      />
    </form>
  );
}

function NameField({ defaultValue }: { defaultValue: string }) {
  const t = useTranslations("account.contributor");
  const tYou = useTranslations("account.you");
  return (
    <div>
      <label htmlFor="contributorDisplayName" className="sr-only">
        {t("nameLabel")}
      </label>
      <input
        id="contributorDisplayName"
        name="displayName"
        type="text"
        maxLength={120}
        required
        autoFocus
        defaultValue={defaultValue}
        aria-describedby="contributorDisplayNameHint"
        className={FIELD_CLASS}
      />
      <p
        id="contributorDisplayNameHint"
        className="mt-2 text-sm text-muted-foreground"
      >
        {tYou("nameHint")}
      </p>
    </div>
  );
}

function CountryField({ defaultValue }: { defaultValue: string }) {
  const t = useTranslations("account.contributor");
  const rawLocale = useLocale();
  const locale = isLocale(rawLocale) ? rawLocale : "en";
  const options = useCountryOptions(locale);
  return (
    <div>
      <label htmlFor="contributorHomeCountryCode" className="sr-only">
        {t("countryLabel")}
      </label>
      <select
        id="contributorHomeCountryCode"
        name="homeCountryCode"
        defaultValue={defaultValue}
        aria-describedby="contributorHomeCountryHint"
        className={FIELD_CLASS}
      >
        <option value="">{t("countryUnset")}</option>
        {options.map((country) => (
          <option key={country.code} value={country.code}>
            {country.name}
          </option>
        ))}
      </select>
      <p
        id="contributorHomeCountryHint"
        className="mt-2 text-sm text-muted-foreground"
      >
        {t("countryHint")}
      </p>
    </div>
  );
}

function SlugField({ defaultValue }: { defaultValue: string }) {
  const t = useTranslations("account.contributor");
  return (
    <div>
      <label htmlFor="contributorPublicSlug" className="sr-only">
        {t("slugLabel")}
      </label>
      <div className="flex overflow-hidden rounded-[10px] border border-border-subtle bg-background focus-within:border-accent">
        <span className="flex items-center pl-3 text-base text-muted-foreground">
          /contributors/
        </span>
        <input
          id="contributorPublicSlug"
          name="publicSlug"
          type="text"
          maxLength={60}
          autoFocus
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          defaultValue={defaultValue}
          placeholder={t("slugPlaceholder")}
          aria-describedby="contributorPublicSlugHint"
          className="min-w-0 flex-1 bg-transparent py-2.5 pr-3 text-base focus:outline-none"
        />
      </div>
      <p
        id="contributorPublicSlugHint"
        className="mt-2 text-sm text-muted-foreground"
      >
        {t("slugHint2")}
      </p>
    </div>
  );
}

export function useCountryOptions(locale: Locale) {
  return useMemo(() => {
    const localized = COUNTRY_OPTIONS.map((country) => ({
      code: country.code,
      name:
        formatCountryName(country.code, locale, country.name) ?? country.name,
    }));
    if (locale === "en") return localized;
    const collator = new Intl.Collator(intlLocale(locale));
    return localized.sort((a, b) => collator.compare(a.name, b.name));
  }, [locale]);
}
