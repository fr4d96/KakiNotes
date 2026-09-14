"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import {
  LOCALES,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  type Locale,
} from "@/i18n/locales";

const localeSchema = z.enum(LOCALES);

export type SetLocaleResult = { ok: true; locale: Locale } | { ok: false };

/**
 * Writes the language cookie components/locale-toggle.tsx reads back through
 * i18n/request.ts.
 *
 * The value the client sends is re-validated here against LOCALES (Zod, not
 * a cast): the toggle only ever offers two values, but a Server Action is a
 * public endpoint and anything can call it. A rejected value sets nothing
 * and reports `ok: false` -- it never falls back to writing a default,
 * because "you asked for garbage, so I changed your language to English" is
 * not a helpful response either.
 *
 * `path: "/"` so one cookie covers every route; `sameSite: "lax"` so a
 * link into the site from elsewhere still arrives in the chosen language;
 * not `httpOnly`, on purpose -- nothing sensitive is in it and there is no
 * reason to hide the visitor's own preference from the visitor. No
 * redirect and no revalidatePath: the caller does router.refresh(), which
 * re-renders the current route with the new cookie in place.
 */
export async function setLocaleAction(
  input: unknown,
): Promise<SetLocaleResult> {
  const parsed = localeSchema.safeParse(input);
  if (!parsed.success) return { ok: false };

  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, parsed.data, {
    path: "/",
    sameSite: "lax",
    maxAge: LOCALE_COOKIE_MAX_AGE,
  });

  return { ok: true, locale: parsed.data };
}
