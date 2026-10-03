// Shared 32px round hit-target for every per-story icon action (Edit,
// Preview/Review, Delete, Link, Take down and their confirm/cancel steps) --
// consistent size and hover treatment whether the action is a Link or a
// button. Pulled out of my-stories-view.tsx into its own module so
// link-main-story-dialog.tsx (which my-stories-view.tsx also imports) can
// reuse it without the two files importing each other.
export const ACTION_ICON_CLASS =
  "inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-surface-muted disabled:pointer-events-none disabled:opacity-60";
