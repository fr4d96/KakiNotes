"use client";

import { useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { MenuIcon } from "@/components/icons";

// Either a real navigable link, or an action item (e.g. "open the sign-in
// modal") -- distinguished by which of href/onClick is present, never both.
type NavItem =
  | { label: string; href: string; onClick?: never }
  | { label: string; href?: never; onClick: () => void };

// >=48px rows: the sheet is a thumb surface, so each destination is a full
// row, not a text-sized link.
const rowClass =
  "press flex min-h-12 w-full items-center rounded-xl px-3 text-left text-base font-medium hover:bg-surface-muted active:bg-surface-muted";

/**
 * The signed-out phone menu. Only the open/close state is client-side; the
 * menu itself is a bottom sheet (components/ui/bottom-sheet.tsx), which owns
 * Escape, backdrop tap, the close button, drag-to-dismiss, focus trapping and
 * returning focus to this button. The trigger is a real <button> with
 * aria-expanded.
 *
 * The `md:hidden` breakpoint here must match whatever breakpoint the
 * caller's own desktop nav uses to hide itself (currently `md:flex` in
 * components/site-header.tsx) -- otherwise there's a dead viewport range
 * where neither nav is visible. (The sheet also closes itself if the
 * viewport grows past `md` while open.)
 */
export function MobileNavToggle({
  navItems,
  inverted = false,
  settings,
}: {
  navItems: NavItem[];
  inverted?: boolean;
  /**
   * Rows under the links, after a divider: the theme and language switches
   * (their "sheetRow" variants), which signed out have no other home on a
   * phone. They don't close the sheet, so the change is seen in place.
   */
  settings?: ReactNode;
}) {
  const t = useTranslations("common");
  const tNav = useTranslations("nav");
  const [open, setOpen] = useState(false);
  const menuId = useId();

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        // An icon, not the word: a round button the same size as the theme
        // and language buttons beside it. "Menu" stays its accessible name.
        aria-label={t("menu")}
        title={t("menu")}
        onClick={() => setOpen((value) => !value)}
        // A plain icon, no outline (iOS bar-button style), so it sits
        // quietly beside the Sign in button; it highlights only on press.
        className={`press flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-surface-muted ${
          inverted ? "text-white" : "text-foreground"
        }`}
      >
        <MenuIcon className="h-5 w-5" />
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title={t("menu")}>
        <nav id={menuId} aria-label={tNav("primary")}>
          <ul className="flex flex-col gap-0.5">
            {navItems.map((item) => {
              // Captured outside the closures below so TS's narrowing of
              // item.href/item.onClick (which doesn't reliably survive
              // property access inside a nested arrow function) isn't
              // needed -- these are plain locals instead.
              const href = item.href;
              const onItemClick = item.onClick;
              return (
                <li key={item.label}>
                  {href ? (
                    <Link
                      href={href}
                      onClick={() => setOpen(false)}
                      className={rowClass}
                    >
                      {item.label}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className={rowClass}
                      onClick={() => {
                        setOpen(false);
                        onItemClick?.();
                      }}
                    >
                      {item.label}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>
        {settings ? (
          <div className="mt-2 flex flex-col gap-0.5 border-t border-border-subtle pt-2">
            {settings}
          </div>
        ) : null}
      </BottomSheet>
    </div>
  );
}
