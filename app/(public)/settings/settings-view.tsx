"use client";

import { useId, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { Locale } from "@/i18n/locales";
import { setLocaleAction } from "@/lib/i18n/set-locale-action";
import { AvatarSetting } from "./avatar-setting";
import { CountrySetting } from "./country-setting";
import { ProfileLinks, ProfileSignOut } from "@/components/profile-links";
import {
  ACCENT_PRESETS,
  DEFAULT_ACCENT_ID,
  GROUNDS,
  deriveAccentPalette,
  type AccentSet,
} from "@/lib/theme/accent";
import {
  applyAccentPalette,
  setAccentColor,
  setThemePreference,
  useAccentChoice,
  useThemePreference,
  type ThemePreference,
} from "@/lib/theme/preferences";

/**
 * Settings (2026-11-17): the home for how the app looks and reads on this
 * device -- theme, accent colour, language -- moved out of the account and
 * ☰ menus, which now only navigate. Since 2026-11-18 it also holds the
 * signed-in viewer's avatar (AvatarSetting), the one account preference
 * that is about how you appear rather than who you are; it is saved to the
 * account, not the device, and drawn only when signed in. Open to everyone, signed in or not:
 * these are device preferences, not account data, and a visitor reading in
 * Chinese needs the language switch as much as a contributor does.
 *
 * Everything applies the moment it is chosen; the page itself (and the
 * rest of the app) is the main preview, and the two small cards show the
 * accent in BOTH themes, since a picked colour is tuned differently for
 * each (lib/theme/accent.ts).
 */

/** The default, as the app's own tokens draw it (no stored override). */
const KINGFISHER: { light: AccentSet; dark: AccentSet } = {
  light: {
    accent: "#0068a3",
    tagForeground: "#00527f",
    tagBackground: "rgba(0, 104, 163, 0.1)",
  },
  dark: {
    accent: "#3fb6f2",
    tagForeground: "#8fd3f7",
    tagBackground: "rgba(63, 182, 242, 0.15)",
  },
};

/** The presets in hue order, closing the circle, for the Custom wheel. */
const WHEEL = [
  ...[
    "kingfisher",
    "fern",
    "ember",
    "pohutukawa",
    "rose",
    "grape",
    "cobalt",
  ].map((id) => ACCENT_PRESETS.find((p) => p.id === id)!.hex),
  ACCENT_PRESETS[0].hex,
];

const LANGUAGES: { locale: Locale; label: string }[] = [
  // Each language named in itself, so a reader can always find their own.
  { locale: "en", label: "English" },
  { locale: "zh-CN", label: "简体中文" },
];

export function SettingsView({ locale }: { locale: Locale }) {
  const t = useTranslations("settings");
  const languageId = useId();

  return (
    <div className="mx-auto w-full max-w-xl px-4 pt-4 pb-16 sm:px-6 sm:pt-10">
      <h1 className="text-3xl font-extrabold tracking-[-.025em] max-md:sr-only">
        {t("title")}
      </h1>

      <div className="flex flex-col gap-8 md:mt-8">
        {/* ---- Profile (signed in only): the avatar ---- */}
        <AvatarSetting />

        {/* ---- Phones: the profile screen's links (was the avatar menu) ---- */}
        <ProfileLinks />

        {/* ---- Personalize ---- */}
        <section aria-labelledby="settings-personalize">
          <h2
            id="settings-personalize"
            className="px-1 text-sm font-bold text-muted-foreground"
          >
            {t("personalize")}
          </h2>
          <div className="mt-2 rounded-2xl bg-surface p-4 shadow-sm sm:p-5">
            <AppearanceControls />
          </div>
        </section>
      </div>

      {/* ---- Country (moved here from the phone header's flag) ---- */}
      <CountrySetting />

      {/* ---- Language ---- */}
      <section aria-labelledby="settings-language" className="mt-8">
        <h2
          id={languageId}
          className="px-1 text-sm font-bold text-muted-foreground"
        >
          <span id="settings-language">{t("language")}</span>
        </h2>
        <LanguageList
          locale={locale}
          labelledBy={languageId}
          className="mt-2 overflow-hidden rounded-2xl bg-surface shadow-sm"
        />
      </section>

      <div className="mt-8">
        <ProfileSignOut />
      </div>

      <p className="mt-6 px-1 text-xs text-muted-foreground">
        {t("deviceNote")}
      </p>
    </div>
  );
}

/**
 * Theme and accent colour: device preferences that apply the moment they
 * are chosen. Shared by /settings and the signed-in "You" page (/account).
 */
export function AppearanceControls() {
  const t = useTranslations("settings");
  const theme = useThemePreference();
  const choice = useAccentChoice();
  const themeId = useId();
  const accentId = useId();

  const chosenHex =
    choice.kind === "custom"
      ? choice.hex
      : (ACCENT_PRESETS.find((p) => p.id === choice.id)?.hex ?? "#0068a3");
  const preview =
    choice.kind === "preset" && choice.id === DEFAULT_ACCENT_ID
      ? KINGFISHER
      : (deriveAccentPalette(chosenHex) ?? KINGFISHER);

  const themeOptions: { value: ThemePreference; label: string }[] = [
    { value: "light", label: t("themeLight") },
    { value: "dark", label: t("themeDark") },
    { value: "system", label: t("themeSystem") },
  ];

  return (
    <div className="space-y-7">
      {/* Appearance */}
      <div>
        <p id={themeId} className="text-base font-bold">
          {t("theme")}
        </p>
        <div
          role="radiogroup"
          aria-labelledby={themeId}
          className="mt-3 grid grid-cols-3 gap-1 rounded-full bg-surface-muted p-1"
        >
          {themeOptions.map((option) => {
            const selected = theme === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setThemePreference(option.value)}
                className={`press min-h-11 rounded-full px-2 text-sm font-semibold transition-colors ${
                  selected
                    ? "bg-surface text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Accent colour */}
      <div>
        <p id={accentId} className="text-base font-bold">
          {t("accent")}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">{t("accentHelp")}</p>

        <div
          role="radiogroup"
          aria-labelledby={accentId}
          className="mt-4 grid grid-cols-4 gap-x-2 gap-y-4"
        >
          {ACCENT_PRESETS.map((preset) => {
            const selected =
              choice.kind === "preset" && choice.id === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setAccentColor(preset.hex)}
                className="press group flex flex-col items-center gap-1.5 rounded-xl focus-visible:outline-offset-4"
              >
                <Swatch color={preset.hex} selected={selected} />
                <span
                  className={`text-xs ${
                    selected
                      ? "font-bold text-foreground"
                      : "font-medium text-muted-foreground"
                  }`}
                >
                  {t(`presets.${preset.id}`)}
                </span>
              </button>
            );
          })}

          {/* Custom: the device's own colour picker. The input covers
            the swatch (not hidden behind a label) so a tap reaches it
            directly on iOS. `input` previews live while the picker is
            open; `change` keeps the colour. */}
          <label className="press group relative flex cursor-pointer flex-col items-center gap-1.5 rounded-xl focus-within:outline-2 focus-within:outline-offset-4 focus-within:outline-ring">
            <Swatch
              color={choice.kind === "custom" ? choice.hex : null}
              selected={choice.kind === "custom"}
            />
            <span
              className={`text-xs ${
                choice.kind === "custom"
                  ? "font-bold text-foreground"
                  : "font-medium text-muted-foreground"
              }`}
            >
              {t("custom")}
            </span>
            <input
              type="color"
              role="radio"
              aria-checked={choice.kind === "custom"}
              aria-label={t("customPick")}
              value={chosenHex}
              onInput={(event) =>
                applyAccentPalette(
                  deriveAccentPalette(event.currentTarget.value),
                )
              }
              onChange={(event) => setAccentColor(event.target.value)}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </label>
        </div>

        {/* Both themes at once: the picked colour, as each one draws it. */}
        <div className="mt-5 grid grid-cols-2 gap-3" aria-hidden="true">
          <PreviewCard
            label={t("previewLight")}
            ground={GROUNDS.light.ground}
            ink="#24201c"
            onAccent={GROUNDS.light.onAccent}
            set={preview.light}
            word={t("previewWord")}
            button={t("previewButton")}
            tag={t("previewTag")}
          />
          <PreviewCard
            label={t("previewDark")}
            ground={GROUNDS.dark.ground}
            ink="#ece7e0"
            onAccent={GROUNDS.dark.onAccent}
            set={preview.dark}
            word={t("previewWord")}
            button={t("previewButton")}
            tag={t("previewTag")}
          />
        </div>

        {!(choice.kind === "preset" && choice.id === DEFAULT_ACCENT_ID) ? (
          <button
            type="button"
            onClick={() => setAccentColor(null)}
            className="mt-4 min-h-11 text-sm font-bold text-accent hover:underline"
          >
            {t("reset")}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** The language list (each named in itself); switching refreshes the app. */
export function LanguageList({
  locale,
  labelledBy,
  className,
}: {
  locale: Locale;
  labelledBy: string;
  className?: string;
}) {
  const router = useRouter();
  const [switching, startSwitching] = useTransition();
  const languageId = labelledBy;

  function chooseLanguage(next: Locale) {
    if (next === locale) return;
    startSwitching(async () => {
      const result = await setLocaleAction(next);
      if (result.ok) router.refresh();
    });
  }

  return (
    <div
      role="radiogroup"
      aria-labelledby={languageId}
      aria-busy={switching || undefined}
      className={className}
    >
      {LANGUAGES.map((language, index) => {
        const selected = language.locale === locale;
        return (
          <button
            key={language.locale}
            type="button"
            role="radio"
            aria-checked={selected}
            lang={language.locale}
            disabled={switching}
            onClick={() => chooseLanguage(language.locale)}
            className={`press flex min-h-13 w-full items-center justify-between px-4 text-left text-base font-medium hover:bg-surface-muted ${
              index > 0 ? "border-t border-border-subtle" : ""
            }`}
          >
            {language.label}
            {selected ? (
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-5 w-5 text-accent"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12.5 10 17.5 19 7" />
              </svg>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** A round colour swatch; `null` draws the "pick your own" wheel. */
function Swatch({
  color,
  selected,
}: {
  color: string | null;
  selected: boolean;
}) {
  return (
    <span
      className={`block h-11 w-11 rounded-full transition-shadow ${
        selected
          ? "ring-2 ring-foreground ring-offset-2 ring-offset-surface"
          : "ring-1 ring-border-subtle"
      }`}
      style={
        color
          ? { background: color }
          : {
              // A colour wheel says "any colour" without words -- drawn
              // from the presets themselves, so it adds no new colours.
              background: `conic-gradient(${WHEEL.join(", ")})`,
            }
      }
    />
  );
}

/** One theme's miniature: a headline word, a button and a tag. */
function PreviewCard({
  label,
  ground,
  ink,
  onAccent,
  set,
  word,
  button,
  tag,
}: {
  label: string;
  ground: string;
  ink: string;
  onAccent: string;
  set: AccentSet;
  word: string;
  button: string;
  tag: string;
}) {
  return (
    <div
      className="rounded-xl p-3 ring-1 ring-border-subtle"
      style={{ background: ground, color: ink }}
    >
      <p className="text-xs font-semibold opacity-70">{label}</p>
      <p
        className="mt-1 text-lg leading-tight font-extrabold tracking-[-.02em]"
        style={{ color: set.accent }}
      >
        {word}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span
          className="rounded-full px-2.5 py-1 text-xs font-bold"
          style={{ background: set.accent, color: onAccent }}
        >
          {button}
        </span>
        <span
          className="rounded-full px-2 py-0.5 text-xs"
          style={{ background: set.tagBackground, color: set.tagForeground }}
        >
          {tag}
        </span>
      </div>
    </div>
  );
}
