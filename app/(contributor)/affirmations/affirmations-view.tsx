"use client";

import {
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { useLocale, useTranslations } from "next-intl";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { isLocale } from "@/i18n/locales";
import { formatRelativeTime } from "@/lib/i18n/format";
import {
  AFFIRMATION_LABEL_MAX,
  AFFIRMATION_LINK_MAX,
} from "@/lib/validation/affirmation";
import type {
  AffirmationLink,
  AffirmationNote,
} from "@/lib/affirmations/types";
import {
  createAffirmationLinkAction,
  deleteAffirmationLinkAction,
  deleteAffirmationNoteAction,
  renameAffirmationLinkAction,
  setAffirmationLinkActiveAction,
  type AffirmationActionResult,
} from "./actions";

const pillButton =
  "press inline-flex min-h-11 items-center justify-center rounded-full border border-border-subtle px-4 text-sm font-bold hover:bg-surface-muted disabled:opacity-60";
const textInput =
  "mt-1 min-h-11 w-full rounded-md border border-border-subtle bg-surface px-3 py-2";

/**
 * Whether the browser can open the native share sheet. A store read, not an
 * effect, so the server render (false) and hydration agree and the Share
 * button simply appears on devices that have it (iPhone Safari / the
 * installed app).
 */
function useCanShare(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () =>
      typeof navigator !== "undefined" && typeof navigator.share === "function",
    () => false,
  );
}

/**
 * /affirmations: the contributor's share links and the private notes people
 * leave through them. Notes are plain text, drawn as React text with
 * `white-space: pre-wrap` to keep line breaks -- never as HTML (Engineering
 * Rule 7). Nothing on this page is, or can become, public.
 */
export function AffirmationsView({
  links,
  notes,
  siteUrl,
  now,
}: {
  links: AffirmationLink[];
  notes: AffirmationNote[];
  siteUrl: string;
  now?: string;
}) {
  const t = useTranslations("affirmations");

  return (
    <div className="mx-auto max-w-3xl px-4 pt-4 pb-12 sm:px-6 sm:py-16">
      <h1 className="journiq-heading text-[2.4rem] max-md:sr-only">
        {t("title")}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">{t("intro")}</p>

      <section aria-labelledby="affirmation-links-heading" className="mt-8">
        <h2 id="affirmation-links-heading" className="text-lg font-black">
          {t("links.heading")}
        </h2>
        <CreateLinkForm atLimit={links.length >= AFFIRMATION_LINK_MAX} />
        {links.length === 0 ? (
          <p className="mt-4 rounded-xl border border-border-subtle bg-surface p-6 text-sm text-muted-foreground">
            {t("links.empty")}
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {links.map((link) => (
              <li key={link.id}>
                <LinkRow link={link} siteUrl={siteUrl} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="affirmation-notes-heading" className="mt-12">
        <h2 id="affirmation-notes-heading" className="text-lg font-black">
          {t("notes.heading")}
        </h2>
        {notes.length === 0 ? (
          <p className="mt-4 rounded-xl border border-border-subtle bg-surface p-6 text-sm text-muted-foreground">
            {t("notes.empty")}
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {notes.map((note) => (
              <li key={note.id}>
                <NoteCard note={note} now={now} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function CreateLinkForm({ atLimit }: { atLimit: boolean }) {
  const t = useTranslations("affirmations");
  const [state, formAction, pending] = useActionState(
    createAffirmationLinkAction,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);
  const inputId = useId();
  const errorId = useId();

  // Clear the box after a successful create.
  useEffect(() => {
    if (state.savedAt) formRef.current?.reset();
  }, [state.savedAt]);

  return (
    <form ref={formRef} action={formAction} className="mt-4">
      <label htmlFor={inputId} className="block text-sm font-medium">
        {t("links.labelLabel")}
      </label>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <input
          id={inputId}
          name="label"
          type="text"
          maxLength={AFFIRMATION_LABEL_MAX}
          placeholder={t("links.labelPlaceholder")}
          aria-describedby={state.error ? errorId : undefined}
          className={textInput}
        />
        <button
          type="submit"
          disabled={pending || atLimit}
          className="press min-h-11 shrink-0 rounded-full bg-accent px-5 text-sm font-black text-accent-foreground hover:opacity-90 disabled:opacity-60"
        >
          {pending ? t("links.creating") : t("links.create")}
        </button>
      </div>
      {atLimit && (
        <p className="mt-2 text-xs text-muted-foreground">
          {t("errors.linkLimit", { max: AFFIRMATION_LINK_MAX })}
        </p>
      )}
      {state.error && (
        <p id={errorId} role="alert" className="mt-2 text-sm text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}

function LinkRow({
  link,
  siteUrl,
}: {
  link: AffirmationLink;
  siteUrl: string;
}) {
  const t = useTranslations("affirmations");
  const canShare = useCanShare();
  const url = `${siteUrl.replace(/\/+$/, "")}/notes/${link.token}`;
  const urlId = useId();
  const [renaming, setRenaming] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(
    action: () => Promise<AffirmationActionResult>,
    onOk?: () => void,
  ) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) onOk?.();
      else setError(result.error);
    });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked; select the address so it can be copied by
      // hand instead.
      const field = document.getElementById(urlId);
      if (field instanceof HTMLInputElement) field.select();
    }
  }

  async function share() {
    try {
      await navigator.share({
        title: t("share.title"),
        text: t("share.text"),
        url,
      });
    } catch {
      // The person closed the share sheet (AbortError), or sharing failed;
      // either way there is nothing to report.
    }
  }

  const title = link.label ?? t("links.untitled");

  return (
    <div className="rounded-xl border border-border-subtle bg-surface p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-bold">{title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("links.noteCount", { count: link.note_count })}
            {" · "}
            {link.is_active ? t("links.statusOn") : t("links.statusOff")}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={link.is_active}
          aria-label={t("links.toggleLabel", { name: title })}
          disabled={pending}
          onClick={() =>
            run(() => setAffirmationLinkActiveAction(link.id, !link.is_active))
          }
          className="press inline-flex min-h-11 items-center gap-2 rounded-full border border-border-subtle px-3 text-sm font-bold disabled:opacity-60"
        >
          <span
            aria-hidden="true"
            className={`relative inline-block h-5 w-9 rounded-full ${
              link.is_active ? "bg-accent" : "bg-surface-muted"
            }`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-[left] ${
                link.is_active ? "left-[1.1rem]" : "left-0.5"
              }`}
            />
          </span>
          {link.is_active ? t("links.on") : t("links.off")}
        </button>
      </div>

      <div className="mt-3">
        <label htmlFor={urlId} className="sr-only">
          {t("links.urlLabel", { name: title })}
        </label>
        <input
          id={urlId}
          readOnly
          value={url}
          onFocus={(event) => event.currentTarget.select()}
          className="min-h-11 w-full rounded-md border border-border-subtle bg-surface-muted px-3 py-2 font-mono text-xs"
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={copy} className={pillButton}>
          {copied ? t("links.copied") : t("links.copy")}
        </button>
        {canShare && (
          <button type="button" onClick={share} className={pillButton}>
            {t("links.share")}
          </button>
        )}
        <button
          type="button"
          onClick={() => setRenaming((value) => !value)}
          aria-expanded={renaming}
          className={pillButton}
        >
          {t("links.rename")}
        </button>
        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          className={`${pillButton} text-destructive`}
        >
          {t("links.delete")}
        </button>
        <span className="sr-only" role="status">
          {copied ? t("links.copied") : ""}
        </span>
      </div>

      {renaming && <RenameForm link={link} onDone={() => setRenaming(false)} />}

      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <ConfirmDialog
        open={confirmingDelete}
        danger
        pending={pending}
        title={t("links.deleteTitle")}
        description={t("links.deleteBody", { count: link.note_count })}
        confirmLabel={t("links.delete")}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={() =>
          run(
            () => deleteAffirmationLinkAction(link.id),
            () => setConfirmingDelete(false),
          )
        }
      />
    </div>
  );
}

function RenameForm({
  link,
  onDone,
}: {
  link: AffirmationLink;
  onDone: () => void;
}) {
  const t = useTranslations("affirmations");
  const [state, formAction, pending] = useActionState(
    renameAffirmationLinkAction,
    {},
  );
  const inputId = useId();

  useEffect(() => {
    if (state.savedAt) onDone();
  }, [state.savedAt, onDone]);

  return (
    <form action={formAction} className="mt-3">
      <input type="hidden" name="linkId" value={link.id} />
      <label htmlFor={inputId} className="block text-sm font-medium">
        {t("links.labelLabel")}
      </label>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <input
          id={inputId}
          name="label"
          type="text"
          defaultValue={link.label ?? ""}
          maxLength={AFFIRMATION_LABEL_MAX}
          autoFocus
          className={textInput}
        />
        <button
          type="submit"
          disabled={pending}
          className="press min-h-11 shrink-0 rounded-full bg-accent px-5 text-sm font-black text-accent-foreground disabled:opacity-60"
        >
          {pending ? t("links.saving") : t("links.save")}
        </button>
      </div>
      {state.error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}

function NoteCard({ note, now }: { note: AffirmationNote; now?: string }) {
  const t = useTranslations("affirmations");
  const tRelative = useTranslations("common.relativeTime");
  const tCommon = useTranslations("common");
  const rawLocale = useLocale();
  const locale = isLocale(rawLocale) ? rawLocale : "en";
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await deleteAffirmationNoteAction(note.id);
      if (result.ok) setConfirmingDelete(false);
      else setError(result.error);
    });
  }

  return (
    <article className="rounded-xl border border-border-subtle bg-surface p-4 shadow-sm sm:p-5">
      {/* React text + pre-wrap: line breaks kept, markup never interpreted. */}
      <p className="text-base leading-relaxed break-words whitespace-pre-wrap">
        {note.body}
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          <span className="font-bold text-foreground">
            {note.author_name ?? tCommon("anonymous")}
          </span>
          {" · "}
          {note.link_label
            ? t("notes.viaLink", { label: note.link_label })
            : t("notes.viaUntitled")}
          {" · "}
          {formatRelativeTime(
            note.created_at,
            locale,
            tRelative,
            now ? new Date(now) : undefined,
          )}
        </p>
        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          className={`${pillButton} text-destructive`}
        >
          {t("notes.delete")}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <ConfirmDialog
        open={confirmingDelete}
        danger
        pending={pending}
        title={t("notes.deleteTitle")}
        description={t("notes.deleteBody")}
        confirmLabel={t("notes.delete")}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={remove}
      />
    </article>
  );
}
