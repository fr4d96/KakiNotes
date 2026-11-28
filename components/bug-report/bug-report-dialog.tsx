"use client";

import { useActionState, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { POP_MOTION, useDialogMotion } from "@/components/ui/dialog-motion";
import {
  submitBugReportAction,
  type BugReportFormState,
} from "@/lib/bug-reports/submit-action";
import { previousInAppPath } from "@/lib/navigation/in-app-history";
import {
  BUG_REPORT_HONEYPOT_FIELD,
  BUG_REPORT_MAX,
  BUG_REPORT_MIN,
} from "@/lib/validation/bug-report";

/** Pages where the bug is almost certainly about where the reader came from. */
// /settings for signed-out visitors, /account (the "You" page) when signed in.
const OPENED_FROM = new Set(["/settings", "/account"]);

/**
 * "Report a bug": a trigger plus a native <dialog>. Recording only -- the
 * report is saved for the owner to review and nothing acts on it.
 *
 * Accessibility comes from the native modal dialog: showModal() makes the
 * rest of the page inert (that is the focus trap -- Tab cannot leave the
 * dialog), Escape closes it through useDialogMotion's onCancel, and focus
 * returns to the trigger when it closes. The textarea has a real <label>, a
 * hint and a live character count tied to it with aria-describedby.
 *
 * `variant` picks the trigger's look: a full-width row for the Settings
 * list, or an inline footer link.
 */
export function BugReportButton({
  variant = "row",
  className = "",
}: {
  variant?: "row" | "link";
  className?: string;
}) {
  const t = useTranslations("bugReport");
  const [open, setOpen] = useState(false);
  // Remounts the form on every open, so a sent or failed report never
  // greets the next one.
  const [formKey, setFormKey] = useState(0);
  const [pagePath, setPagePath] = useState("");
  const pathname = usePathname() ?? "";

  function openDialog() {
    const previous = previousInAppPath();
    setPagePath(OPENED_FROM.has(pathname) && previous ? previous : pathname);
    setFormKey((key) => key + 1);
    setOpen(true);
  }

  const trigger =
    variant === "row" ? (
      <button
        type="button"
        onClick={openDialog}
        aria-haspopup="dialog"
        className={`press flex min-h-12 w-full items-center gap-3 px-4 text-left text-base font-medium active:bg-surface-muted ${className}`}
      >
        <BugIcon />
        {t("trigger")}
      </button>
    ) : (
      <button
        type="button"
        onClick={openDialog}
        aria-haspopup="dialog"
        className={`inline-flex min-h-11 items-center text-left hover:text-foreground md:min-h-0 ${className}`}
      >
        {t("trigger")}
      </button>
    );

  return (
    <>
      {trigger}
      <BugReportDialog
        open={open}
        onClose={() => setOpen(false)}
        formKey={formKey}
        pagePath={pagePath}
      />
    </>
  );
}

export function BugReportDialog({
  open,
  onClose,
  formKey,
  pagePath,
}: {
  open: boolean;
  onClose: () => void;
  formKey: number;
  pagePath: string;
}) {
  const t = useTranslations("bugReport");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const introId = useId();
  const motion = useDialogMotion(dialogRef, open, () => POP_MOTION, onClose);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={introId}
      onClose={onClose}
      onCancel={motion.onCancel}
      onClick={(event) => {
        // A click on the <dialog> itself (not a child) hit the backdrop.
        if (event.target === dialogRef.current) onClose();
      }}
      className="journiq-modal m-auto max-h-[calc(100dvh-2rem)] w-[min(92vw,28rem)] overflow-y-auto rounded-2xl border border-border-subtle bg-surface p-0 text-foreground shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-sm"
    >
      <div className="px-5 py-5 sm:px-6 sm:py-6">
        <h2 id={titleId} className="text-lg font-semibold tracking-tight">
          {t("title")}
        </h2>
        <p id={introId} className="mt-1 text-sm text-foreground/70">
          {t("intro")}
        </p>
        <BugReportForm key={formKey} pagePath={pagePath} onClose={onClose} />
      </div>
    </dialog>
  );
}

function BugReportForm({
  pagePath,
  onClose,
}: {
  pagePath: string;
  onClose: () => void;
}) {
  const t = useTranslations("bugReport");
  const [state, formAction, pending] = useActionState<
    BugReportFormState,
    FormData
  >(submitBugReportAction, {});
  const [description, setDescription] = useState("");
  const descriptionId = useId();
  const hintId = useId();
  const countId = useId();
  const errorId = useId();

  if (state.sent) {
    return (
      <div className="mt-5">
        <div
          role="status"
          className="rounded-xl bg-surface-muted p-4 text-center"
        >
          <p className="font-bold">{t("thanksTitle")}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("thanksBody")}
          </p>
        </div>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="journiq-button bg-accent text-sm text-accent-foreground"
          >
            {t("close")}
          </button>
        </div>
      </div>
    );
  }

  const describedBy = [hintId, countId, state.error ? errorId : null]
    .filter(Boolean)
    .join(" ");

  return (
    <form action={formAction} className="mt-5 space-y-4">
      <input type="hidden" name="pagePath" value={pagePath} />
      {/* Honeypot: off-screen, out of the tab order and the a11y tree. */}
      <div
        aria-hidden="true"
        className="absolute -left-[9999px] h-0 w-0 overflow-hidden"
      >
        <label>
          Website
          <input
            type="text"
            name={BUG_REPORT_HONEYPOT_FIELD}
            tabIndex={-1}
            autoComplete="off"
            defaultValue=""
          />
        </label>
      </div>

      <div>
        <label htmlFor={descriptionId} className="block text-sm font-medium">
          {t("descriptionLabel")}
        </label>
        <p id={hintId} className="mt-0.5 text-xs text-muted-foreground">
          {t("descriptionHint")}
        </p>
        <textarea
          id={descriptionId}
          name="description"
          required
          minLength={BUG_REPORT_MIN}
          maxLength={BUG_REPORT_MAX}
          rows={5}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          aria-describedby={describedBy}
          aria-invalid={state.error ? true : undefined}
          className="mt-2 w-full resize-y rounded-md border border-border-subtle bg-surface px-3 py-2 text-base"
        />
        <p
          id={countId}
          aria-live="polite"
          className="mt-1 text-right text-xs text-muted-foreground"
        >
          {t("characterCount", {
            count: description.length,
            max: BUG_REPORT_MAX,
          })}
        </p>
      </div>

      <p className="text-xs text-muted-foreground">{t("contextNote")}</p>

      {state.error ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {state.error}
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
          {pending ? t("sending") : t("submit")}
        </button>
      </div>
    </form>
  );
}

function BugIcon() {
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
      <path d="M8 9a4 4 0 0 1 8 0v5a4 4 0 0 1-8 0Z" />
      <path d="M12 9v9M4 13h4M16 13h4M5 7l3 2M19 7l-3 2M5 19l3-2M19 19l-3-2M10 5 9 3M14 5l1-2" />
    </svg>
  );
}
