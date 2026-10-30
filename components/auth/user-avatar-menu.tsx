"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { signOutAction } from "@/app/(auth)/actions";
import { ContributorIcon } from "@/components/icons";
import { LocaleToggle } from "@/components/locale-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { useIsPhone } from "@/components/ui/use-is-phone";
import { controlToneClasses } from "@/components/ui-tone";
import type { AppRole } from "@/lib/auth/staff-guard";
import { staffMenuItemsForRole } from "@/lib/auth/staff-menu";

/**
 * Authoring links: only for people who actually author stories. A staff
 * member (moderator/editor/admin) reviews other people's stories, so
 * dropping these keeps their menu to their own role's surfaces plus
 * Account/Sign out -- see `personalMenuItems` below.
 */
// Labels are keys under `nav`, resolved inside the component.
const authoringItems = [
  { href: "/my-stories", key: "myStories" },
  { href: "/my-photos", key: "myPhotos" },
  { href: "/stories/new", key: "newStory" },
] as const;

const accountItem = { href: "/account", key: "account" } as const;

/**
 * Which of the always-on items a role gets. Staff roles get Account only;
 * an ordinary contributor (and anyone whose role we don't know) also gets
 * the authoring links. Like staffMenuItemsForRole this is PRESENTATION
 * ONLY -- /my-stories and /stories/new remain reachable and permitted for
 * staff accounts, they are simply not advertised in their menu.
 */
function personalMenuItems(role: AppRole | null) {
  const isStaff = role === "admin" || role === "editor" || role === "moderator";
  return isStaff ? [accountItem] : [...authoringItems, accountItem];
}

/**
 * The single, always-present profile icon: every signed-in header
 * (SiteHeader, ContributorNav, ModerationNav, EditorialNav, ReadinessNav)
 * renders this instead of its own ad hoc sign-out/account links, so the
 * same actions are reachable the same way regardless of which screen is
 * showing. Opens a dropdown with, in order: the caller's staff surfaces (if
 * any), then My Stories / New Story for contributors, then Account and Sign
 * out. Staff roles skip the two authoring links -- a moderator, editor or
 * admin sees only their own role's surfaces plus Account and Sign out. The
 * avatar itself is the emoji chosen on /account
 * (lib/avatar.ts's pre-loaded set), falling back to a generic person icon
 * for accounts that haven't picked one yet.
 *
 * `extraItems` is for a header's own links that don't belong in the shared
 * menu (e.g. SiteHeader's mobile placement, where this avatar replaces the
 * hamburger entirely and so also has to carry the public primary nav).
 * Omitted wherever a header already has its own always-visible nav bar for
 * those links.
 *
 * `role` adds the caller's own staff surfaces as a separate top group --
 * a moderator gets Stories to review / Reader reports, an editor gets the
 * editorial queue, an admin gets all of it. Every header passes it, because
 * the point is that a staff member browsing a PUBLIC page or a contributor
 * page has no other route back to their dashboard; being consistent on the
 * staff headers too means the same switcher is in the same place on every
 * screen.
 *
 * The role here is PRESENTATION ONLY and is never an authorization input --
 * see lib/auth/staff-menu.ts. proxy.ts, each route group's layout, and RLS
 * each re-derive it server-side, so a link rendered in error still leads to
 * a flat 404.
 */
export function UserAvatarMenu({
  emoji,
  inverted = false,
  extraItems,
  role,
}: {
  emoji: string | null;
  inverted?: boolean;
  extraItems?: { href: string; label: string }[];
  role?: AppRole | null;
}) {
  const t = useTranslations("nav");
  const staffItems = staffMenuItemsForRole(role ?? null);
  const menuItems = personalMenuItems(role ?? null);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  // Phones get the same menu as a bottom sheet (thumb-reachable, 48px rows);
  // md+ keeps the anchored dropdown. Exactly one of them is ever rendered.
  const isPhone = useIsPhone();

  useEffect(() => {
    // The sheet is a modal <dialog>: it has its own backdrop tap and Escape.
    if (!open || isPhone) return;

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, isPhone]);

  // One definition of the menu's contents, drawn with the dropdown's compact
  // rows or the sheet's >=48px rows.
  const rowClass = isPhone
    ? "press flex min-h-12 w-full items-center rounded-xl px-3 text-left text-base font-medium hover:bg-surface-muted active:bg-surface-muted"
    : "block rounded-lg px-3 py-2 text-sm font-medium hover:bg-surface-muted";
  const dividerClass = isPhone
    ? "my-1.5 border-t border-border-subtle"
    : "my-1 border-t border-border-subtle";

  const menuBody = (
    <>
      {staffItems.length > 0 && (
        <>
          {/*
            Labelled, because "Moderation" sitting directly above "My
            Stories" reads as one flat list of unrelated places. The
            heading is what makes the group legible as "your staff
            surfaces" rather than more account actions.
          */}
          <p className="px-3 pt-1.5 pb-1 font-mono text-[0.625rem] tracking-[0.14em] text-muted-foreground uppercase">
            {t("staff")}
          </p>
          {staffItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className={rowClass}
            >
              {item.label}
            </Link>
          ))}
          <div className={dividerClass} />
        </>
      )}
      {extraItems && extraItems.length > 0 && (
        <>
          {extraItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className={rowClass}
            >
              {item.label}
            </Link>
          ))}
          <div className={dividerClass} />
        </>
      )}
      {menuItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          role="menuitem"
          onClick={() => setOpen(false)}
          className={rowClass}
        >
          {t(item.key)}
        </Link>
      ))}
      {/* Theme and language live here rather than as two more round
          buttons in the header: they are settings, not destinations,
          and the header was getting crowded on a phone. Signed-out
          visitors have no menu, so the header keeps the icon form for
          them (site-header.tsx). The toggles draw their own rows; the
          wrapper lifts them to the sheet's 48px on phones. */}
      <div className={dividerClass} />
      <div
        className={
          isPhone
            ? "[&>button]:min-h-12 [&>button]:rounded-xl [&>button]:text-base [&>button]:active:bg-surface-muted"
            : undefined
        }
      >
        <ThemeToggle variant="menuItem" />
        <LocaleToggle variant="menuItem" />
      </div>
      <div className={dividerClass} />
      <form action={signOutAction}>
        <button type="submit" role="menuitem" className={rowClass}>
          {t("signOut")}
        </button>
      </form>
    </>
  );

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={isPhone ? undefined : menuId}
        aria-label={t("accountMenu")}
        className={`press flex h-11 w-11 items-center justify-center rounded-full border text-lg md:h-10 md:w-10 transition-transform hover:-translate-y-0.5 ${controlToneClasses(inverted)}`}
      >
        {emoji ?? <ContributorIcon className="h-5 w-5" />}
      </button>

      {open && !isPhone && (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 top-12 z-50 max-h-[calc(100vh-5rem)] w-56 overflow-y-auto rounded-xl border border-border-subtle bg-surface p-1.5 text-foreground shadow-xl"
        >
          {menuBody}
        </div>
      )}

      <BottomSheet
        open={open && isPhone}
        onClose={() => setOpen(false)}
        title={t("accountMenu")}
      >
        <div role="menu" aria-label={t("accountMenu")}>
          {menuBody}
        </div>
      </BottomSheet>
    </div>
  );
}
