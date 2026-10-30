// Round hit-target for every per-story icon action (Edit, Preview/Review,
// Delete, Take down, Start revision, Reopen and their confirm/cancel steps) --
// consistent size and treatment whether the action is a Link or a button.
// my-stories-view.tsx is its only consumer.
//
// Phones get a 44px box (the minimum comfortable thumb target) around the SAME
// 32px visible circle: the hover/pressed fill is a ::before inset 6px, painted
// behind the icon (`isolate` + `-z-10` keep it under the glyph without
// touching the children), so the row looks exactly as light as before and
// only the tappable area grows. From md up (pointer + keyboard) the box
// shrinks back to the 32px circle itself.
export const ACTION_ICON_CLASS =
  "press relative isolate inline-flex h-11 w-11 items-center justify-center rounded-full before:absolute before:inset-1.5 before:-z-10 before:rounded-full before:transition-colors hover:before:bg-surface-muted active:before:bg-surface-muted md:h-8 md:w-8 md:before:inset-0 disabled:pointer-events-none disabled:opacity-60";
