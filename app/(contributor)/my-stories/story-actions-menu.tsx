"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { useIsPhone } from "@/components/ui/use-is-phone";
import { MORE_BUTTON_CLASS, menuItemClass } from "./action-icon-class";

// Only one story's menu is open at a time: opening one tells every other.
const OPEN_EVENT = "story-actions-menu:open";

type MenuContextValue = { isPhone: boolean; close: () => void };
const MenuContext = createContext<MenuContextValue>({
  isPhone: false,
  close: () => {},
});

/** What a menu item needs from its menu: row sizing and a way to close it. */
export function useStoryActionsMenu() {
  return useContext(MenuContext);
}

function MoreIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="5" cy="12" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="19" cy="12" r="1.75" />
    </svg>
  );
}

/** A navigation row in the menu (icon + text). */
export function StoryMenuLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const { isPhone, close } = useStoryActionsMenu();
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={close}
      className={menuItemClass(isPhone)}
    >
      {icon}
      <span>{children}</span>
    </Link>
  );
}

/**
 * The "..." button on a story card and the menu of secondary actions it
 * opens: a bottom sheet on phones, an anchored popover from md up (same split
 * and the same menu semantics as components/auth/user-avatar-menu.tsx).
 *
 * The menu children are rendered INSIDE the panel and are never unmounted
 * when an item opens its confirm dialog -- the dialog (Delete, Take down,
 * Edit anyway) is a child of the item, so the menu stays open underneath it
 * rather than tearing the dialog down with it. Escape closes the popover and
 * returns focus to the button; the phone sheet is a native modal <dialog>,
 * which does both itself.
 */
export function StoryActionsMenu({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("myStories");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const isPhone = useIsPhone();
  const label = t("actions.menuLabel", { title });

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: menuId }));
    function handleOther(event: Event) {
      if ((event as CustomEvent<string>).detail !== menuId) setOpen(false);
    }
    window.addEventListener(OPEN_EVENT, handleOther);
    return () => window.removeEventListener(OPEN_EVENT, handleOther);
  }, [open, menuId]);

  useEffect(() => {
    // The sheet is a modal <dialog>: it has its own backdrop tap and Escape.
    if (!open || isPhone) return;

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    // Keyboard users land on the first action.
    panelRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, isPhone]);

  function handleMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
    if (!keys.includes(event.key)) return;
    const items = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ??
        [],
    ).filter((el) => !el.closest("dialog"));
    if (items.length === 0) return;
    event.preventDefault();
    const current = items.indexOf(document.activeElement as HTMLElement);
    let next = current;
    if (event.key === "ArrowDown") next = (current + 1) % items.length;
    else if (event.key === "ArrowUp")
      next = (current - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else next = items.length - 1;
    items[next]?.focus();
  }

  const menu = (
    <MenuContext.Provider value={{ isPhone, close }}>
      <div
        ref={panelRef}
        role="menu"
        aria-label={label}
        onKeyDown={handleMenuKeyDown}
        className="flex flex-col gap-0.5"
      >
        {children}
      </div>
    </MenuContext.Provider>
  );

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open && !isPhone ? menuId : undefined}
        aria-label={t("actions.more", { title })}
        className={MORE_BUTTON_CLASS}
      >
        <MoreIcon />
      </button>

      {open && !isPhone && (
        <div
          id={menuId}
          className="absolute right-0 top-full z-50 mt-1 w-60 rounded-xl border border-border-subtle bg-surface p-1.5 text-foreground shadow-xl"
        >
          {menu}
        </div>
      )}

      <BottomSheet open={open && isPhone} onClose={close} title={label}>
        {menu}
      </BottomSheet>
    </div>
  );
}
