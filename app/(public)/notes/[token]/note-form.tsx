"use client";

import { useActionState, useId, useState } from "react";
import { useTranslations } from "next-intl";
import {
  AFFIRMATION_AUTHOR_NAME_MAX,
  AFFIRMATION_HONEYPOT_FIELD,
  AFFIRMATION_NOTE_MAX,
} from "@/lib/validation/affirmation";
import { submitAffirmationNoteAction } from "./actions";

const field =
  "mt-1 w-full rounded-md border border-border-subtle bg-surface px-3 py-2 text-base";

/**
 * The anonymous writing form. The token travels as a hidden field so the
 * form is a plain <form action> that works before hydration; the server
 * action re-validates everything and resolves the link from the token
 * itself. The honeypot is positioned off-screen and hidden from assistive
 * tech and the tab order -- a person never reaches it, a form-stuffing bot
 * fills it.
 */
export function NoteForm({ token }: { token: string }) {
  const t = useTranslations("affirmationWrite");
  const [state, formAction, pending] = useActionState(
    submitAffirmationNoteAction,
    {},
  );
  const [body, setBody] = useState("");
  const bodyId = useId();
  const nameId = useId();
  const countId = useId();
  const errorId = useId();

  if (state.sent) {
    return (
      <div
        role="status"
        className="mt-8 rounded-xl border border-border-subtle bg-surface p-6 text-center shadow-sm"
      >
        <p className="text-lg font-black">{t("thanksTitle")}</p>
        <p className="mt-2 text-sm text-muted-foreground">{t("thanksBody")}</p>
      </div>
    );
  }

  const remaining = AFFIRMATION_NOTE_MAX - body.length;

  return (
    <form action={formAction} className="mt-8 space-y-5">
      <input type="hidden" name="token" value={token} />

      <div>
        <label htmlFor={bodyId} className="block text-sm font-medium">
          {t("bodyLabel")}
        </label>
        <textarea
          id={bodyId}
          name="body"
          required
          rows={7}
          maxLength={AFFIRMATION_NOTE_MAX}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder={t("bodyPlaceholder")}
          aria-describedby={`${countId}${state.error ? ` ${errorId}` : ""}`}
          className={`${field} min-h-40 resize-y`}
        />
        <p
          id={countId}
          className={`mt-1 text-xs ${
            remaining < 50
              ? "font-bold text-foreground"
              : "text-muted-foreground"
          }`}
        >
          {t("characterCount", {
            count: body.length,
            max: AFFIRMATION_NOTE_MAX,
          })}
        </p>
      </div>

      <div>
        <label htmlFor={nameId} className="block text-sm font-medium">
          {t("nameLabel")}
        </label>
        <input
          id={nameId}
          name="authorName"
          type="text"
          autoComplete="name"
          maxLength={AFFIRMATION_AUTHOR_NAME_MAX}
          className={`${field} min-h-11`}
        />
        <p className="mt-1 text-xs text-muted-foreground">{t("nameHint")}</p>
      </div>

      {/* Honeypot. Not display:none (some bots skip those); moved off-screen,
          out of the accessibility tree and the tab order instead. */}
      <div
        aria-hidden="true"
        className="absolute -left-[9999px] h-px w-px overflow-hidden"
      >
        <label>
          {t("honeypotLabel")}
          <input
            type="text"
            name={AFFIRMATION_HONEYPOT_FIELD}
            tabIndex={-1}
            autoComplete="off"
            defaultValue=""
          />
        </label>
      </div>

      {state.error && (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="press min-h-12 w-full rounded-full bg-accent px-6 text-base font-black text-accent-foreground hover:opacity-90 disabled:opacity-60 sm:w-auto"
      >
        {pending ? t("sending") : t("send")}
      </button>

      <p className="text-xs text-muted-foreground">{t("privacyNote")}</p>
    </form>
  );
}
