/**
 * The moderation screens' shared look, so the queue, the review screen,
 * reports and takedowns cannot drift apart again (DESIGN.md: surface lists
 * on the warm ground, 20px panels, pill controls at 44px, 10px fields).
 * Class strings only.
 */

/** Page wrapper: reading width, the app's gutters, room for the home bar. */
export const PAGE =
  "mx-auto w-full max-w-5xl px-4 pt-6 pb-[max(4rem,calc(env(safe-area-inset-bottom)+3rem))] sm:px-6 sm:pt-10";

/** One h1 per screen, at Headline size (The Card-Scale Heading Rule). */
export const PAGE_TITLE =
  "text-2xl leading-tight font-extrabold tracking-[-0.025em] sm:text-3xl";

export const PAGE_INTRO = "mt-1.5 max-w-2xl text-sm text-muted-foreground";

/** A quiet group heading above or inside a panel. */
export const SECTION_HEADING = "text-sm font-bold text-muted-foreground";

/** A grouped surface on the ground, the "You" page's shape. */
export const PANEL = "rounded-[20px] bg-surface p-4 shadow-sm sm:p-5";

/** Rows sharing one surface, hairlines between them. */
export const ROW_LIST =
  "divide-y divide-border-subtle overflow-hidden rounded-[20px] bg-surface shadow-sm";

export const EMPTY_STATE =
  "rounded-[20px] bg-surface p-8 text-center text-sm text-muted-foreground shadow-sm";

export const FIELD_LABEL = "text-sm font-medium";

/** 16px text: the floor under which iOS zooms the page on focus. */
export const FIELD =
  "mt-1.5 block min-h-11 w-full rounded-[10px] border border-border-subtle bg-background px-3 py-2 text-base text-foreground focus:border-accent focus:outline-none";

export const BUTTON_PRIMARY =
  "press inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-accent px-5 text-sm font-bold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60";

export const BUTTON_OUTLINE =
  "press inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-border-subtle px-5 text-sm font-bold transition-colors hover:bg-surface-muted disabled:opacity-60";

export const BUTTON_DANGER =
  "press inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-destructive px-5 text-sm font-bold text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-60";

export const TEXT_LINK =
  "press inline-flex min-h-11 items-center text-sm font-bold text-accent underline-offset-4 hover:underline";

export const CHIP =
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold";

export const CHIP_TONE = {
  neutral: "bg-surface-muted text-foreground/70",
  tag: "bg-tag-background text-tag-foreground",
  alert: "bg-destructive/12 text-destructive",
} as const;
