"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { controlToneClasses } from "@/components/ui-tone";

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
}: {
  navItems: NavItem[];
  inverted?: boolean;
}) {
  const t = useTranslations("common");
  const tNav = useTranslations("nav");
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const toggleToneClasses = controlToneClasses(inverted);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
        className={`press min-h-11 rounded-full border px-4 py-1.5 text-sm transition-colors ${toggleToneClasses}`}
      >
        {t("menu")}
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
      </BottomSheet>
    </div>
  );
}
