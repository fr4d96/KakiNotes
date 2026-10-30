import type { MetadataRoute } from "next";

// Installable web app (PWA) manifest -- see "Installable web app (PWA)" in
// docs/architecture.md. Deliberately NO service worker anywhere in this app:
// caching pages or images offline could keep serving draft/private/unapproved
// content after access is revoked (Engineering Rules 12-13). iOS installs a
// manifest-only site to the home screen without one.
//
// Colours are the light rendition's --background (app/globals.css, DESIGN.md
// `light-background`); the dark rendition is covered by the `themeColor` media
// queries in app/layout.tsx's viewport export.
const BACKGROUND = "#eef2f7";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kakinotes",
    short_name: "Kakinotes",
    description:
      "Detailed first-person stories from people on a Working Holiday Visa in New Zealand.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: BACKGROUND,
    theme_color: BACKGROUND,
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
