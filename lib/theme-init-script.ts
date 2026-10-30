// Rendered as an inline <script> in app/layout.tsx's <head>.
// Blocking, pre-hydration: reads the persisted theme (or the system
// preference) and sets data-theme before first paint so there is never a
// flash of the wrong theme or a client/server hydration mismatch.
//
// It also marks a RELOAD (pull to refresh, components/pull-to-refresh.tsx)
// with data-splash="skip", so the launch splash (components/app-splash.tsx)
// is hidden before it can paint -- it is for launching the app, not for a
// refresh. A cold launch from the home screen is a "navigate", so it keeps
// its splash.
export const themeInitScript = `(() => {
  try {
    const saved = localStorage.getItem("journiq-theme");
    const system = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    document.documentElement.dataset.theme = saved === "dark" || saved === "light" ? saved : system;
  } catch {
    document.documentElement.dataset.theme = "light";
  }
  try {
    const nav = performance.getEntriesByType("navigation")[0];
    if (nav && nav.type === "reload") document.documentElement.dataset.splash = "skip";
  } catch {}
})();`;
