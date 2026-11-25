"use client";

import Link from "next/link";
import {
  useActionState,
  useEffect,
  useEffectEvent,
  useId,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import {
  setUsernameAction,
  updateProfileAction,
  type AccountFormState,
} from "@/app/(contributor)/actions";
import { ContributorForm } from "@/app/(contributor)/account/contributor-form";
import {
  IdentityFieldForm,
  useCountryOptions,
  type ContributorIdentity,
  type IdentityField,
} from "@/app/(contributor)/account/identity-field-form";
import {
  DriveTab,
  type DriveResultStatus,
} from "@/app/(contributor)/account/drive-tab";
import type { DriveMoveSummary } from "@/lib/story/media-move";
import {
  AppearanceControls,
  LanguageList,
} from "@/app/(public)/settings/settings-view";
import { CountryPicker } from "@/app/(public)/settings/country-setting";
import { setAvatarAction } from "@/app/(public)/settings/actions";
import { AvatarPicker } from "@/components/account/avatar-picker";
import {
  DisclosureRow,
  LinkRow,
  RowActions,
  YouGroup,
} from "@/components/you/disclosure-row";
import { ChevronIcon } from "@/components/icons";
import { signOutAction } from "@/app/(auth)/actions";
import { authoringMenuItems } from "@/components/auth/user-avatar-menu";
import { staffMenuItemsForRole } from "@/lib/auth/staff-menu";
import { setViewerAvatar, useViewerIdentity } from "@/lib/auth/viewer-identity";
import { countryMessageSegment, countryUrlPrefix } from "@/lib/story/countries";
import { useCurrentCountry } from "@/lib/story/use-current-country";
import { useAccentChoice, useThemePreference } from "@/lib/theme/preferences";
import { ACCENT_PRESETS } from "@/lib/theme/accent";
import type { Locale } from "@/i18n/locales";
import type { DriveConnectionStatus } from "@/lib/drive/connection-status";

/**
 * "You" (2026-11-21): Settings and Account as one scrolling page, the
 * signed-in Profile tab's screen. Who you are on top; then grouped rows,
 * iOS-Settings style, each showing its current value and opening in place
 * to change it (components/you/disclosure-row.tsx). Groups run from what
 * readers see to what only you see to what only this device sees, so where
 * a thing lives also says who it reaches.
 *
 * Every save goes through the same Server Actions the old tabbed page used
 * (they validate and RLS scopes each write to the caller); this file only
 * arranges them. /settings stays as the signed-out preferences page.
 */
export function YouView({
  locale,
  accountName,
  username,
  identity,
  avatarEmoji,
  drive,
  reviewOnly = false,
}: {
  locale: Locale;
  accountName: string;
  username: string;
  identity: ContributorIdentity | null;
  avatarEmoji: string;
  drive: {
    configured: boolean;
    connection: DriveConnectionStatus;
    resultStatus: DriveResultStatus;
    moveSummary: DriveMoveSummary | null;
  };
  /** A moderator: no byline, public page or Drive, which are for authors. */
  reviewOnly?: boolean;
}) {
  const t = useTranslations("account.you");
  const tC = useTranslations("account.contributor");
  const tS = useTranslations("settings");
  const tNav = useTranslations("nav");
  const tCountry = useTranslations("countryContent");
  const viewer = useViewerIdentity();
  const country = useCurrentCountry();
  const theme = useThemePreference();
  const accent = useAccentChoice();
  const countries = useCountryOptions(locale);
  const languageId = useId();

  const publicPage =
    identity?.publicProfileEnabled && identity.publicSlug
      ? `/contributors/${identity.publicSlug}`
      : null;

  const valueOf = (field: IdentityField): [ReactNode, boolean] => {
    if (!identity) return [null, true];
    switch (field) {
      case "name":
        return [identity.displayName, false];
      case "bio":
        return identity.bio
          ? [identity.bio.split("\n")[0], false]
          : [t("notSet"), true];
      case "country": {
        const name = countries.find(
          (c) => c.code === identity.homeCountryCode,
        )?.name;
        return name ? [name, false] : [tC("countryUnset"), true];
      }
      case "slug":
        return identity.publicSlug
          ? [`/${identity.publicSlug}`, false]
          : [t("notSet"), true];
    }
  };

  const identityRows: { field: IdentityField; id: string; label: string }[] = [
    { field: "name", id: "name contributor-identity", label: t("rowName") },
    { field: "bio", id: "bio", label: t("rowBio") },
    { field: "country", id: "home-country", label: t("rowHomeCountry") },
    { field: "slug", id: "page-address", label: t("rowPageAddress") },
  ];

  const accentLabel =
    accent.kind === "custom"
      ? tS("custom")
      : tS(
          `presets.${(ACCENT_PRESETS.find((p) => p.id === accent.id) ?? ACCENT_PRESETS[0]).id}`,
        );
  const themeLabel =
    theme === "light"
      ? tS("themeLight")
      : theme === "dark"
        ? tS("themeDark")
        : tS("themeSystem");

  const staff = staffMenuItemsForRole(viewer.role);
  const own = authoringMenuItems(viewer.role).filter(
    (item) => item.key === "myPhotos" || item.key === "affirmations",
  );

  return (
    <div className="mx-auto w-full max-w-xl px-4 pt-6 pb-16 sm:px-6 sm:pt-12">
      <IdentityHeader
        avatarEmoji={viewer.avatarEmoji ?? avatarEmoji}
        name={identity?.displayName || accountName}
        username={username}
        publicPage={reviewOnly ? null : publicPage}
        reviewOnly={reviewOnly}
      />

      <div className="mt-8 flex flex-col gap-7">
        {reviewOnly ? null : identity ? (
          <YouGroup heading={t("groupPublic")} footnote={t("groupPublicNote")}>
            {identityRows.map((row) => {
              const [value, muted] = valueOf(row.field);
              return (
                <DisclosureRow
                  key={row.field}
                  id={row.id}
                  label={row.label}
                  value={value}
                  valueMuted={muted}
                >
                  {(close) => (
                    <IdentityFieldForm
                      field={row.field}
                      identity={identity}
                      onDone={close}
                    />
                  )}
                </DisclosureRow>
              );
            })}
          </YouGroup>
        ) : (
          <section
            id="contributor-identity"
            aria-labelledby="you-setup"
            className="scroll-mt-28 rounded-2xl bg-surface p-4 shadow-sm sm:p-5"
          >
            <h2
              id="you-setup"
              className="text-xl font-extrabold tracking-[-0.025em]"
            >
              {t("setupTitle")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("setupBody")}
            </p>
            <ContributorForm existing={null} />
          </section>
        )}

        <YouGroup heading={t("groupSignIn")} footnote={t("groupSignInNote")}>
          <DisclosureRow
            id="username sign-in"
            label={t("rowUsername")}
            value={username ? `@${username}` : t("notSet")}
            valueMuted={!username}
          >
            {(close) => <UsernameEditor username={username} onDone={close} />}
          </DisclosureRow>
          <DisclosureRow
            id="account-name profile"
            label={t("rowAccountName")}
            value={accountName || t("notSet")}
            valueMuted={!accountName}
          >
            {(close) => (
              <AccountNameEditor accountName={accountName} onDone={close} />
            )}
          </DisclosureRow>
        </YouGroup>

        {reviewOnly ? null : (
          <YouGroup heading={t("groupPhotos")}>
            <DisclosureRow
              id="drive"
              label={t("rowDrive")}
              value={
                !drive.configured
                  ? t("driveUnavailable")
                  : drive.connection.connected
                    ? (drive.connection.googleAccountEmail ?? t("connected"))
                    : t("notConnected")
              }
              valueMuted={!drive.connection.connected}
            >
              {() => (
                <div className="-mt-4">
                  <DriveTab
                    configured={drive.configured}
                    connection={drive.connection}
                    resultStatus={drive.resultStatus}
                    moveSummary={drive.moveSummary}
                  />
                </div>
              )}
            </DisclosureRow>
          </YouGroup>
        )}

        {staff.length > 0 ? (
          <YouGroup heading={tNav("staff")}>
            {staff.map((item) => (
              <LinkRow key={item.href} href={item.href} label={item.label} />
            ))}
          </YouGroup>
        ) : null}

        <YouGroup heading={t("groupPlaces")}>
          {own.map((item) => (
            <LinkRow key={item.href} href={item.href} label={tNav(item.key)} />
          ))}
          {reviewOnly ? (
            <LinkRow
              href={countryUrlPrefix(country) || "/"}
              label={tNav("home")}
            />
          ) : null}
          <LinkRow href="/notifications" label={tNav("notifications")} />
          <LinkRow
            href={`${countryUrlPrefix(country)}/about`}
            label={tNav("about")}
          />
        </YouGroup>

        <YouGroup heading={t("groupDevice")} footnote={tS("deviceNote")}>
          <DisclosureRow
            id="appearance"
            label={tS("theme")}
            value={`${themeLabel} · ${accentLabel}`}
          >
            {() => <AppearanceControls />}
          </DisclosureRow>
          <DisclosureRow
            id="country"
            label={t("rowStoryCountry")}
            value={tCountry(`${countryMessageSegment(country)}.name`)}
          >
            {() => (
              <>
                <p className="mb-3 text-sm text-muted-foreground">
                  {tS("countryHelp")}
                </p>
                <CountryPicker
                  returnTo="/account"
                  className="overflow-hidden rounded-xl border border-border-subtle"
                />
              </>
            )}
          </DisclosureRow>
          <DisclosureRow
            id="language"
            label={tS("language")}
            value={locale === "zh-CN" ? "简体中文" : "English"}
          >
            {() => (
              <>
                <span id={languageId} className="sr-only">
                  {tS("language")}
                </span>
                <LanguageList
                  locale={locale}
                  labelledBy={languageId}
                  className="overflow-hidden rounded-xl border border-border-subtle"
                />
              </>
            )}
          </DisclosureRow>
        </YouGroup>

        <form action={signOutAction}>
          <button
            type="submit"
            className="press flex min-h-13 w-full items-center justify-center rounded-2xl bg-surface text-base font-bold text-destructive shadow-sm active:bg-surface-muted"
          >
            {tNav("signOut")}
          </button>
        </form>
      </div>
    </div>
  );
}

/**
 * Who you are, as readers meet you: the avatar (tap to change it, in
 * place), the name your stories carry, and the way to your public page.
 */
function IdentityHeader({
  avatarEmoji,
  name,
  username,
  publicPage,
  reviewOnly,
}: {
  reviewOnly: boolean;
  avatarEmoji: string;
  name: string;
  username: string;
  publicPage: string | null;
}) {
  const t = useTranslations("account.you");
  const tS = useTranslations("settings");
  const viewer = useViewerIdentity();
  const [picking, setPicking] = useState(false);
  const [saving, startSaving] = useTransition();
  const [failed, setFailed] = useState(false);
  const pickerId = useId();
  const pickerLabelId = useId();

  // Old links to "/settings#avatar" and "/account#avatar" open the picker.
  useEffect(() => {
    const sync = () => {
      if (window.location.hash === "#avatar") setPicking(true);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  function choose(next: string) {
    const previous = viewer.avatarEmoji;
    setFailed(false);
    setViewerAvatar(next || null);
    startSaving(async () => {
      const result = await setAvatarAction(next);
      if (!result.ok) {
        setViewerAvatar(previous);
        setFailed(true);
      }
    });
  }

  return (
    <header id="avatar" className="scroll-mt-28">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => setPicking((open) => !open)}
          aria-expanded={picking}
          aria-controls={pickerId}
          aria-label={avatarEmoji ? t("changeAvatar") : t("chooseAvatar")}
          className="press relative flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-surface text-4xl leading-none shadow-sm"
        >
          <span aria-hidden="true">{avatarEmoji || <AvatarPlaceholder />}</span>
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -bottom-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-accent text-accent-foreground ring-3 ring-background"
          >
            <PencilGlyph />
          </span>
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl leading-tight font-extrabold tracking-[-0.025em]">
            {name || t("titleFallback")}
          </h1>
          {username ? (
            <p className="truncate text-base text-muted-foreground">
              @{username}
            </p>
          ) : null}
          {publicPage ? (
            <Link
              href={publicPage}
              className="press mt-1.5 inline-flex min-h-9 items-center gap-1 text-sm font-bold text-accent"
            >
              {t("viewPublicPage")}
              <ChevronIcon aria-hidden="true" className="h-3.5 w-3.5" />
            </Link>
          ) : reviewOnly ? null : (
            <p className="mt-1 text-sm text-muted-foreground">
              {t("noPublicPage")}
            </p>
          )}
        </div>
      </div>

      <div
        id={pickerId}
        hidden={!picking}
        aria-busy={saving || undefined}
        className="mt-4 rounded-2xl bg-surface p-4 shadow-sm"
      >
        <div className="flex items-center justify-between gap-3">
          <p id={pickerLabelId} className="text-base font-bold">
            {tS("avatar")}
          </p>
          <button
            type="button"
            onClick={() => setPicking(false)}
            className="press min-h-10 rounded-full px-3 text-sm font-bold text-accent"
          >
            {tS("avatarDone")}
          </button>
        </div>
        <p className="mt-0.5 mb-3 text-sm text-muted-foreground">
          {tS("avatarHelp")}
        </p>
        <AvatarPicker
          value={viewer.avatarEmoji ?? avatarEmoji}
          onChange={choose}
          disabled={saving}
          labelledBy={pickerLabelId}
        />
        {failed ? (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {tS("avatarFailed")}
          </p>
        ) : null}
      </div>
    </header>
  );
}

const initialState: AccountFormState = {};

function useCloseOnSuccess(state: AccountFormState, onDone: () => void) {
  const finish = useEffectEvent(() => onDone());
  useEffect(() => {
    if (state.success) finish();
  }, [state]);
}

function UsernameEditor({
  username,
  onDone,
}: {
  username: string;
  onDone: () => void;
}) {
  const t = useTranslations("account.username");
  const tYou = useTranslations("account.you");
  const [state, formAction, pending] = useActionState(
    setUsernameAction,
    initialState,
  );
  useCloseOnSuccess(state, onDone);
  return (
    <form action={formAction} noValidate>
      <label htmlFor="username" className="sr-only">
        {t("label")}
      </label>
      <div className="flex overflow-hidden rounded-[10px] border border-border-subtle bg-background focus-within:border-accent">
        <span className="flex items-center pl-3 text-base text-muted-foreground">
          @
        </span>
        <input
          id="username"
          name="username"
          type="text"
          maxLength={30}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoFocus
          defaultValue={username}
          placeholder={t("placeholder")}
          aria-describedby="usernameHint"
          className="min-w-0 flex-1 bg-transparent py-2.5 pr-3 pl-0.5 text-base focus:outline-none"
        />
      </div>
      <p id="usernameHint" className="mt-2 text-sm text-muted-foreground">
        {t("hint")}
      </p>
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

function AccountNameEditor({
  accountName,
  onDone,
}: {
  accountName: string;
  onDone: () => void;
}) {
  const t = useTranslations("account.profile");
  const tYou = useTranslations("account.you");
  const [state, formAction, pending] = useActionState(
    updateProfileAction,
    initialState,
  );
  useCloseOnSuccess(state, onDone);
  return (
    <form action={formAction} noValidate>
      <label htmlFor="displayName" className="sr-only">
        {t("nameLabel")}
      </label>
      <input
        id="displayName"
        name="displayName"
        type="text"
        maxLength={120}
        required
        autoFocus
        defaultValue={accountName}
        aria-describedby="accountNameHint"
        className="w-full rounded-[10px] border border-border-subtle bg-background px-3 py-2.5 text-base focus:border-accent focus:outline-none"
      />
      <p id="accountNameHint" className="mt-2 text-sm text-muted-foreground">
        {tYou("accountNameHint")}
      </p>
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

function AvatarPlaceholder() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-9 w-9 text-muted-foreground"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 19.5c1.4-3.2 4-4.8 7-4.8s5.6 1.6 7 4.8" />
    </svg>
  );
}

function PencilGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14.5 5.5 18.5 9.5 9 19H5v-4z" />
    </svg>
  );
}
