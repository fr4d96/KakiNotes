import type en from "../messages/en.json";
import type { LOCALES } from "./locales";

/**
 * Types every `t("...")` key against messages/en.json, so a typo or a key
 * that was never added fails `npm run typecheck` instead of rendering the
 * raw key at runtime. messages/zh-CN.json is held to the same key set by
 * messages/messages.test.ts.
 */
declare module "next-intl" {
  interface AppConfig {
    Locale: (typeof LOCALES)[number];
    Messages: typeof en;
  }
}
