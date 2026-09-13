import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

// The app's default (sans) typeface is Avenir Next, declared globally via
// the --font-sans CSS variable in app/globals.css -- see that file for the
// full fallback stack and rationale. Geist_Mono is kept here only for
// monospace/code text (--font-mono), which stays untouched by that change.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return {
    metadataBase: new URL(siteUrl),
    title: {
      default: "Kakinotes",
      template: "%s | Kakinotes",
    },
    description: t("siteDescription"),
    robots: { index: true, follow: true },
  };
}

/**
 * Deliberately bare: no header, footer, or session check here. Each route
 * group (public, auth, contributor) supplies its own nav in its own layout.
 *
 * Since 2026-09-14 this layout is NOT static: getLocale() reads the
 * language cookie (i18n/request.ts), and reading a cookie makes every route
 * beneath it render per request. That is a deliberate trade -- <html lang>,
 * Server Component copy and generateMetadata() all need the locale before
 * any client code runs, and a URL prefix was rejected because story content
 * is never translated. The public pages that used to rely on ISR now cache
 * their DATA instead (lib/story/public-queries.ts, unstable_cache with the
 * same 60s/3600s windows), so the database sees the same load as before;
 * only the HTML is re-rendered per request.
 */
// Blocking, pre-hydration: reads the persisted theme (or the system
// preference) and sets data-theme before first paint so there is never a
// flash of the wrong theme or a client/server hydration mismatch.
const themeInitScript = `(() => {
  try {
    const saved = localStorage.getItem("journiq-theme");
    const system = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    document.documentElement.dataset.theme = saved === "dark" || saved === "light" ? saved : system;
  } catch {
    document.documentElement.dataset.theme = "light";
  }
})();`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const t = await getTranslations("common");

  return (
    // lang is the real locale, not a constant: screen readers pick their
    // voice from it, so it must flip with the toggle (Engineering Rule 19).
    <html
      lang={locale}
      className={`${geistMono.variable} h-full antialiased`}
      // The blocking inline script below sets data-theme before hydration,
      // deliberately differing from the server-rendered markup (which has
      // no data-theme attribute) -- suppressHydrationWarning tells React
      // this specific, expected attribute mismatch is fine, matching the
      // standard pattern for a pre-hydration theme script.
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-black focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-blue-600"
        >
          {t("skipToMain")}
        </a>
        {/* No props: in a Server Component the provider inherits locale,
            messages and time zone from i18n/request.ts, and hands them to
            every Client Component that calls useTranslations(). */}
        <NextIntlClientProvider>
          <ToastProvider>{children}</ToastProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
