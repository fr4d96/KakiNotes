"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { controlToneClasses } from "@/components/ui-tone";
import { isLocale, otherLocale } from "@/i18n/locales";
import { setLocaleAction } from "@/lib/i18n/set-locale-action";

/**
 * The language switch, rendered beside ThemeToggle in every header
 * (components/site-header.tsx at both breakpoints, components/contributor-nav.tsx).
 * Same 36px bordered pill, same tone classes, so the two read as one control
 * group.
 *
 * Unlike the theme, the language cannot live in localStorage: Server
 * Components, Server Actions and generateMetadata() all need to know it
 * before any client code runs. So the click writes a cookie through a Server
 * Action (lib/i18n/set-locale-action.ts, which re-validates the value) and
 * then router.refresh() re-renders the current route in the new language --
 * no navigation, no lost scroll position, no page-specific reload logic.
 * useTransition gives the button a pending state for the round trip.
 *
 * The glyph shows what you will switch TO ("中" while English is active,
 * "EN" while Chinese is), the same convention as the theme toggle's sun/moon.
 * The accessible name says the same thing in words, in the CURRENT language,
 * because that is the language the screen reader is speaking right now.
 */
export function LocaleToggle({ inverted = false }: { inverted?: boolean }) {
  const t = useTranslations("common.localeToggle");
  const current = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const locale = isLocale(current) ? current : "en";
  const next = otherLocale(locale);
  const label = next === "zh-CN" ? t("switchToZh") : t("switchToEn");
  const toneClasses = controlToneClasses(inverted);

  function handleClick() {
    startTransition(async () => {
      const result = await setLocaleAction(next);
      if (result.ok) router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      aria-label={label}
      aria-busy={isPending || undefined}
      title={label}
      className={`flex h-9 w-9 items-center justify-center rounded-full border text-[0.8rem] font-bold transition-transform hover:-translate-y-0.5 disabled:opacity-60 ${toneClasses}`}
    >
      {/* lang on the glyph only: the accessible name above is in the CURRENT
          language and must be voiced in it, while the visible glyph is in
          the target one. */}
      <span aria-hidden="true" lang={next}>
        {next === "zh-CN" ? "中" : "EN"}
      </span>
    </button>
  );
}
