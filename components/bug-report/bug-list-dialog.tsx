"use client";

import { useId, useRef, useState, useTransition, type FormEvent } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { POP_MOTION, useDialogMotion } from "@/components/ui/dialog-motion";
import { openBugListAction } from "@/lib/bug-reports/list-action";
import { bugFixUrl } from "@/lib/bug-reports/fix-link";
import type { ListedBug } from "@/lib/validation/bug-list";

/**
 * "Bug Lists": a row under Report a bug that opens a password prompt, then
 * a READ-ONLY list of every report with its status and a "Fix with Claude"
 * link per bug (lib/bug-reports/fix-link.ts).
 *
 * The password is checked by the server and the database, never here. The
 * list lives in this component's state only while the pop-up is open, and
 * is dropped (with the typed password) the moment it closes.
 *
 * Same native-<dialog> mechanics as the Report a bug dialog: showModal()
 * makes the page inert (focus stays inside), Escape closes it.
 */
export function BugListButton({ className = "" }: { className?: string }) {
  const t = useTranslations("bugList");
  const [open, setOpen] = useState(false);
  const [openCount, setOpenCount] = useState(0);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpenCount((n) => n + 1);
          setOpen(true);
        }}
        aria-haspopup="dialog"
        className={`press flex min-h-12 w-full items-center gap-3 px-4 text-left text-base font-medium active:bg-surface-muted ${className}`}
      >
        <ListIcon />
        {t("trigger")}
      </button>
      <BugListDialog
        key={openCount}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

function BugListDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("bugList");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const motion = useDialogMotion(dialogRef, open, () => POP_MOTION, onClose);
  const [reports, setReports] = useState<ListedBug[] | null>(null);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={motion.onCancel}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
      className="journiq-modal m-auto max-h-[calc(100dvh-2rem)] w-[min(94vw,32rem)] overflow-y-auto rounded-2xl border border-border-subtle bg-surface p-0 text-foreground shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-sm"
    >
      <div className="px-5 py-5 sm:px-6 sm:py-6">
        <h2 id={titleId} className="text-lg font-semibold tracking-tight">
          {t("title")}
        </h2>
        {reports ? (
          <BugListView reports={reports} onClose={onClose} />
        ) : (
          <PasswordForm onUnlocked={setReports} onClose={onClose} />
        )}
      </div>
    </dialog>
  );
}

function PasswordForm({
  onUnlocked,
  onClose,
}: {
  onUnlocked: (reports: ListedBug[]) => void;
  onClose: () => void;
}) {
  const t = useTranslations("bugList");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputId = useId();
  const introId = useId();
  const errorId = useId();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await openBugListAction(password);
      if (result.ok) {
        setPassword("");
        onUnlocked(result.reports);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={submit} className="mt-2 space-y-4">
      <p id={introId} className="text-sm text-foreground/70">
        {t("passwordIntro")}
      </p>
      <div>
        <label htmlFor={inputId} className="block text-sm font-medium">
          {t("passwordLabel")}
        </label>
        <input
          id={inputId}
          type="password"
          required
          autoComplete="off"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-describedby={error ? `${introId} ${errorId}` : introId}
          aria-invalid={error ? true : undefined}
          className="mt-2 min-h-11 w-full rounded-md border border-border-subtle bg-surface px-3 text-base"
        />
      </div>
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="journiq-button border border-border-subtle text-sm disabled:opacity-60"
        >
          {t("cancel")}
        </button>
        <button
          type="submit"
          disabled={pending}
          className="journiq-button bg-accent text-sm text-accent-foreground disabled:opacity-60"
        >
          {pending ? t("checking") : t("unlock")}
        </button>
      </div>
    </form>
  );
}

function BugListView({
  reports,
  onClose,
}: {
  reports: ListedBug[];
  onClose: () => void;
}) {
  const t = useTranslations("bugList");
  const format = useFormatter();

  return (
    <div className="mt-2">
      <p role="status" className="text-sm text-foreground/70">
        {t("listIntro", { count: reports.length })}
      </p>
      {reports.length > 0 ? (
        <>
          <p className="mt-1 text-xs text-muted-foreground">{t("fixHint")}</p>
          <ul className="mt-4 flex flex-col gap-3">
            {reports.map((bug) => {
              const fixed = bug.status === "fixed";
              return (
                <li
                  key={bug.id}
                  className="rounded-xl border border-border-subtle p-3"
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                    <span
                      className={`rounded-full px-2 py-0.5 font-bold ${
                        fixed
                          ? "bg-accent text-accent-foreground"
                          : "bg-surface-muted text-foreground"
                      }`}
                    >
                      {fixed ? t("fixed") : t("notFixed")}
                    </span>
                    <span className="text-muted-foreground">
                      {t(`status.${bug.status}`)}
                    </span>
                    <time
                      dateTime={bug.createdAt}
                      className="text-muted-foreground"
                    >
                      {format.dateTime(new Date(bug.createdAt), {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </time>
                  </div>
                  {bug.pagePath ? (
                    <p className="mt-2 font-mono text-xs break-all text-muted-foreground">
                      {t("page", { path: bug.pagePath })}
                    </p>
                  ) : null}
                  <p className="mt-2 text-sm break-words whitespace-pre-wrap">
                    {bug.description}
                  </p>
                  {fixed ? null : (
                    <a
                      href={bugFixUrl(bug)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-flex min-h-11 items-center rounded-full bg-accent px-4 text-sm font-bold text-accent-foreground"
                    >
                      {t("fixWithClaude")}
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
      <div className="mt-5 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="journiq-button border border-border-subtle text-sm"
        >
          {t("close")}
        </button>
      </div>
    </div>
  );
}

function ListIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5 shrink-0 text-muted-foreground"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />
    </svg>
  );
}
