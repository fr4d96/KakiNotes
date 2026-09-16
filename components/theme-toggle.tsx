"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { controlToneClasses } from "@/components/ui-tone";

type Theme = "light" | "dark";
type Listener = () => void;

const listeners = new Set<Listener>();

// The DOM attribute is the source of truth (set by the blocking inline
// script in app/layout.tsx before first paint). useSyncExternalStore lets
// this component read it without a setState-in-effect round trip: React
// renders getServerSnapshot() on the server and on the client's first
// (hydrating) pass, then transparently swaps to getSnapshot()'s real value
// right after -- no hydration-mismatch warning, no extra render triggered
// by our own code.
function getSnapshot(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function getServerSnapshot(): Theme {
  return "light";
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setTheme(next: Theme) {
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem("journiq-theme", next);
  } catch {
    // ignore (private browsing / storage disabled)
  }
  listeners.forEach((listener) => listener());
}

export function ThemeToggle({
  inverted = false,
  variant = "icon",
}: {
  inverted?: boolean;
  /**
   * "icon" is the round header button (signed-out visitors, who have no
   * profile menu to hold it). "menuItem" is a full-width row for the
   * profile dropdown (components/auth/user-avatar-menu.tsx), where the
   * toggle lives once someone is signed in.
   */
  variant?: "icon" | "menuItem";
}) {
  const t = useTranslations("common.themeToggle");
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const isDark = theme === "dark";
  const label = isDark ? t("switchToLight") : t("switchToDark");
  const toneClasses = controlToneClasses(inverted);

  if (variant === "menuItem") {
    return (
      <button
        type="button"
        role="menuitem"
        onClick={() => setTheme(isDark ? "light" : "dark")}
        className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium hover:bg-surface-muted"
      >
        <span>{label}</span>
        <span aria-hidden="true">{isDark ? "☀" : "☾"}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={label}
      title={label}
      className={`flex h-9 w-9 items-center justify-center rounded-full border transition-transform hover:-translate-y-0.5 ${toneClasses}`}
    >
      <span aria-hidden="true">{isDark ? "☀" : "☾"}</span>
    </button>
  );
}
