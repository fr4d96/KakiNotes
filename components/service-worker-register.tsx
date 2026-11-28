"use client";

import { useEffect } from "react";

/**
 * Registers public/sw.js, which does one thing: when a page cannot load
 * (no internet, or the host Mac / Cloudflare Tunnel is down) it shows the
 * stored public/offline.html screen instead of an error page. It caches
 * nothing else -- see the header of public/sw.js and "Offline screen" in
 * docs/architecture.md.
 *
 * Registered after the page has loaded so it never competes with the first
 * paint. Browsers without service workers simply keep their own error page.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // Not fatal: without it the reader just gets the normal error
        // page when the site is down.
      });
    };
    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
