"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronIcon } from "@/components/icons";

/**
 * The "You" page's grammar (app/(contributor)/account, 2026-11-21): grouped
 * rows on the warm ground, the way iOS Settings reads, except that a row
 * opens IN PLACE instead of pushing a new screen. Each row names a thing and
 * shows its current value; tapping it reveals the control that changes it,
 * with its own Save, and a successful save folds it shut again.
 *
 * - YouGroup: an optional quiet heading above one rounded surface list.
 * - DisclosureRow: label + value + chevron; the panel slides open beneath.
 *   `#<id>` in the URL opens it on arrival (old links like
 *   /account#contributor-identity and /settings#avatar keep landing on the
 *   right thing).
 * - LinkRow: the same row shape for somewhere else in the app.
 */

export function YouGroup({
  heading,
  footnote,
  children,
}: {
  heading?: string;
  footnote?: ReactNode;
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={heading ? headingId : undefined}>
      {heading ? (
        <h2
          id={headingId}
          className="px-4 pb-2 text-sm font-bold text-muted-foreground"
        >
          {heading}
        </h2>
      ) : null}
      <ul className="divide-y divide-border-subtle overflow-hidden rounded-2xl bg-surface shadow-sm">
        {children}
      </ul>
      {footnote ? (
        <p className="px-4 pt-2 text-xs leading-relaxed text-muted-foreground">
          {footnote}
        </p>
      ) : null}
    </section>
  );
}

export function DisclosureRow({
  id,
  label,
  value,
  valueMuted = false,
  leading,
  children,
}: {
  id: string;
  label: string;
  /** The current value, shown on the right while closed. */
  value?: ReactNode;
  /** "Not set" and friends read quieter than a real value. */
  valueMuted?: boolean;
  leading?: ReactNode;
  /** The editor. Gets `close` so a successful save can fold the row. */
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonId = useId();
  const rowRef = useRef<HTMLLIElement>(null);

  // `#id` opens the row (on arrival and on in-page hash links).
  useEffect(() => {
    const ids = id.split(" ");
    const sync = () => {
      const hash = window.location.hash.slice(1);
      if (hash && ids.includes(hash)) {
        setOpen(true);
        requestAnimationFrame(() =>
          rowRef.current?.scrollIntoView({ block: "start" }),
        );
      }
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [id]);

  const close = () => {
    setOpen(false);
    document.getElementById(buttonId)?.focus();
  };

  return (
    <li ref={rowRef} id={id.split(" ")[0]} className="scroll-mt-28">
      <button
        id={buttonId}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((was) => !was)}
        className="press flex min-h-13 w-full items-center gap-3 px-4 py-2.5 text-left active:bg-surface-muted"
      >
        {leading}
        <span className="shrink-0 text-base font-medium">{label}</span>
        <span
          className={`min-w-0 flex-1 truncate text-right text-base ${
            valueMuted ? "text-muted-foreground/80" : "text-muted-foreground"
          }`}
        >
          {value}
        </span>
        <ChevronIcon
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out motion-reduce:transition-none ${
            open ? "rotate-90" : ""
          }`}
        />
      </button>
      {/* grid-rows 0fr -> 1fr animates to the content's real height with no
          measuring; `inert` keeps a closed editor out of the tab order and
          away from screen readers. */}
      <div
        id={panelId}
        role="region"
        aria-label={label}
        inert={!open}
        className={`grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          {open ? (
            <div className="px-4 pt-1 pb-4">{children(close)}</div>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export function LinkRow({
  href,
  label,
  value,
  leading,
}: {
  href: string;
  label: string;
  value?: ReactNode;
  leading?: ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        className="press flex min-h-13 items-center gap-3 px-4 py-2.5 active:bg-surface-muted"
      >
        {leading}
        <span className="shrink-0 text-base font-medium">{label}</span>
        <span className="min-w-0 flex-1 truncate text-right text-base text-muted-foreground">
          {value}
        </span>
        <ChevronIcon
          aria-hidden="true"
          className="h-4 w-4 shrink-0 text-muted-foreground"
        />
      </Link>
    </li>
  );
}

/** Save / Cancel under an in-place editor: one primary pill, one quiet. */
export function RowActions({
  pending,
  saveLabel,
  savingLabel,
  cancelLabel,
  onCancel,
}: {
  pending: boolean;
  saveLabel: string;
  savingLabel: string;
  cancelLabel: string;
  onCancel: () => void;
}) {
  return (
    <div className="mt-4 flex items-center gap-2">
      <button
        type="submit"
        disabled={pending}
        className="press min-h-11 rounded-full bg-accent px-5 text-sm font-bold text-accent-foreground disabled:opacity-60"
      >
        {pending ? savingLabel : saveLabel}
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={pending}
        className="press min-h-11 rounded-full px-4 text-sm font-bold text-muted-foreground hover:text-foreground"
      >
        {cancelLabel}
      </button>
    </div>
  );
}
