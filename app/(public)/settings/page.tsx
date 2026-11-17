import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { isLocale } from "@/i18n/locales";
import { SettingsView } from "./settings-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  // A personal preferences screen: nothing here for a search engine.
  return { title: t("metaTitle"), robots: { index: false, follow: true } };
}

/**
 * Settings: theme, accent colour and language for this device. Public on
 * purpose (see SettingsView): the preferences are the device's, and a
 * signed-out reader needs the language switch too. The server passes only
 * the current language; everything else is read on the device.
 */
export default async function SettingsPage() {
  const locale = await getLocale();
  return <SettingsView locale={isLocale(locale) ? locale : "en"} />;
}
