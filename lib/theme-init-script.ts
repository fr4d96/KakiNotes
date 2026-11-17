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
    // The reader's own accent (Settings > Personalize), already derived for
    // both themes by lib/theme/accent.ts. Every value is re-checked against
    // the same patterns as parseStoredPalette() before it reaches a style
    // property; anything else is ignored and the default stays.
    const raw = localStorage.getItem("kakinotes-accent");
    if (raw) {
      const p = JSON.parse(raw);
      const hex = /^#[0-9a-f]{6}$/i;
      const rgba = /^rgba\\(\\d{1,3}, \\d{1,3}, \\d{1,3}, 0?\\.\\d{1,3}\\)$/;
      const ok = (s) => s && hex.test(s.accent) && hex.test(s.tagForeground) && rgba.test(s.tagBackground);
      if (p && hex.test(p.source) && ok(p.light) && ok(p.dark)) {
        const st = document.documentElement.style;
        st.setProperty("--user-accent-light", p.light.accent);
        st.setProperty("--user-tag-fg-light", p.light.tagForeground);
        st.setProperty("--user-tag-bg-light", p.light.tagBackground);
        st.setProperty("--user-accent-dark", p.dark.accent);
        st.setProperty("--user-tag-fg-dark", p.dark.tagForeground);
        st.setProperty("--user-tag-bg-dark", p.dark.tagBackground);
      }
    }
  } catch {}
  try {
    const nav = performance.getEntriesByType("navigation")[0];
    if (nav && nav.type === "reload") document.documentElement.dataset.splash = "skip";
  } catch {}
})();`;
