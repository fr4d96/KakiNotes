import type { Metadata, Viewport } from "next";
import { Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { ToastProvider } from "@/components/ui/toast";
import { PhotoLightboxProvider } from "@/components/ui/photo-lightbox";
import { TouchActive } from "@/components/touch-active";
import { AppSplash } from "@/components/app-splash";
import { ClickPulse } from "@/components/click-pulse";
import { appleStartupImages } from "@/lib/pwa/splash-screens";
import { themeInitScript } from "@/lib/theme-init-script";
import { InAppHistory } from "@/components/in-app-history";
import { NoPinchZoom } from "@/components/no-pinch-zoom";
import { PullToRefresh } from "@/components/pull-to-refresh";
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
    // Home-screen launch on iOS: full-screen (no Safari chrome) and the
    // name shown under the icon. See "Installable web app (PWA)" in
    // docs/architecture.md; there is deliberately no service worker.
    appleWebApp: {
      capable: true,
      title: "Kakinotes",
      statusBarStyle: "default",
      // iOS launch images, shown while the home-screen app starts
      // (lib/pwa/splash-screens.ts); the in-app splash takes over after.
      startupImage: appleStartupImages(),
    },
  };
}

// `viewportFit: "cover"` lets the page run edge to edge on notched iPhones;
// the sticky header and the bottom tab bar pad themselves with
// env(safe-area-inset-*) to compensate. Pinch-zoom is deliberately left
// enabled (no maximumScale / userScalable): the iOS form-field zoom is
// handled by a 16px font floor in app/globals.css instead (WCAG 1.4.4).
// The installed home-screen app is the one exception: there pinch-zoom of
// the whole page is switched off so it feels like an app
// (components/no-pinch-zoom.tsx); Safari tabs keep it.
// Colours are --background in app/globals.css (light / dark).
export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef2f7" },
    { media: "(prefers-color-scheme: dark)", color: "#020617" },
  ],
};

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
        {/* Home-screen app only: covers the page until it is ready. */}
        <AppSplash />
        {/* Opts iOS into :active on non-link elements (.press feedback). */}
        <TouchActive />
        {/* Spring-back pulse on every button tap/click, app-wide. */}
        <ClickPulse />
        {/* Lets a story's back arrow use router.back() safely. */}
        <InAppHistory />
        {/* Home-screen app only: no pinch-zooming the whole page. */}
        <NoPinchZoom />
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
          {/* Home-screen app only: pull down at the top to refresh. Inside
              the provider -- it has translated text. */}
          <PullToRefresh />
          <ToastProvider>
            {/* One photo viewer for the whole site: any LightboxPhoto on the
                current page opens it, and it pages through all of them. */}
            <PhotoLightboxProvider>{children}</PhotoLightboxProvider>
          </ToastProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
