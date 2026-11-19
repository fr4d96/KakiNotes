// Shared classes for the per-story actions on a My Stories card: ONE visible
// primary action (icon + text pill) and a "more" (three dots) button that
// opens the rest in story-actions-menu.tsx. my-stories-view.tsx and
// story-actions-menu.tsx are its only consumers.

// The primary action: a text + icon pill. 44px tall on phones (the minimum
// comfortable thumb target), a little tighter from md up (pointer + keyboard).
export const PRIMARY_ACTION_CLASS =
  "press inline-flex h-11 items-center gap-2 rounded-full border border-border-subtle px-4 text-sm font-medium transition-colors hover:bg-surface-muted active:bg-surface-muted md:h-9 disabled:pointer-events-none disabled:opacity-60";

// The "more actions" trigger: a round 44px target around a 20px glyph.
export const MORE_BUTTON_CLASS =
  "press inline-flex h-11 w-11 items-center justify-center rounded-full text-foreground/70 transition-colors hover:bg-surface-muted active:bg-surface-muted aria-expanded:bg-surface-muted md:h-9 md:w-9";

/**
 * One row of the actions menu. Phones (bottom sheet) get >=48px rows and
 * base text; the anchored popover keeps compact rows.
 */
export function menuItemClass(
  isPhone: boolean,
  tone: "default" | "danger" | "muted" = "default",
): string {
  const size = isPhone
    ? "min-h-12 rounded-xl px-3 text-base"
    : "min-h-10 rounded-lg px-3 text-sm";
  const color =
    tone === "danger"
      ? "text-destructive"
      : tone === "muted"
        ? "text-muted-foreground"
        : "text-foreground";
  return `press flex w-full items-center gap-3 text-left font-medium hover:bg-surface-muted active:bg-surface-muted ${size} ${color}`;
}
