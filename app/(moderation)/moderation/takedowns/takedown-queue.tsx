"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  BUTTON_DANGER,
  BUTTON_OUTLINE,
  EMPTY_STATE,
  FIELD,
  FIELD_LABEL,
  PANEL,
} from "@/app/(moderation)/moderation/ui";
import { decideTakedownAction } from "./actions";

export type TakedownRequest = {
  request_id: string;
  story_id: string;
  story_slug: string | null;
  story_title: string | null;
  contributor_note: string | null;
  requested_at: string;
  requester_display_name: string | null;
  story_version: number;
};

/** Whole days a story has stayed public since its author asked it not to. */
function daysWaiting(requestedAt: string): number {
  const ms = Date.now() - new Date(requestedAt).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

/**
 * The pending-takedown queue.
 *
 * Every row leads with how long the request has been waiting, because that
 * is the number with a person behind it: the story has been publicly visible
 * that whole time against its author's stated wish. The queue is ordered
 * oldest-first for the same reason.
 *
 * Approving needs no note — the contributor already said what they wanted.
 * Declining does, and the control refuses to submit without one, because
 * "no" with no reason is not an answer to someone asking for their own
 * writing to come down. `decide_story_takedown()` enforces the same rule
 * server-side; this is the courtesy copy of it.
 */
export function TakedownQueue({ requests }: { requests: TakedownRequest[] }) {
  if (requests.length === 0) {
    return (
      <p className={EMPTY_STATE}>
        No takedown requests waiting. Anything a contributor asks to have
        removed lands here.
      </p>
    );
  }

  return (
    <ul className="space-y-4">
      {requests.map((request) => (
        <TakedownRow key={request.request_id} request={request} />
      ))}
    </ul>
  );
}

function TakedownRow({ request }: { request: TakedownRequest }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [declining, setDeclining] = useState(false);

  const waiting = daysWaiting(request.requested_at);

  async function decide(approve: boolean) {
    if (!approve && note.trim() === "") {
      setDeclining(true);
      setError("Say why you're declining — the contributor sees this.");
      return;
    }
    setPending(true);
    setError(null);
    const result = await decideTakedownAction(
      request.request_id,
      approve,
      request.story_slug,
      note.trim() || undefined,
    );
    if (result.ok) {
      router.refresh();
      return;
    }
    setPending(false);
    setError(result.error);
  }

  return (
    <li className={PANEL}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">
          {request.story_slug ? (
            // New tab on purpose: a moderator opens the story to decide,
            // and navigating away would lose the queue and whatever they had
            // typed into the decline note below.
            <Link
              href={`/stories/${request.story_slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4 hover:no-underline"
            >
              {request.story_title ?? "Untitled story"}
              <span className="sr-only"> (opens in a new tab)</span>
            </Link>
          ) : (
            (request.story_title ?? "Untitled story")
          )}
        </h2>
        <p className="text-sm text-muted-foreground">
          {request.requester_display_name ?? "A contributor"} ·{" "}
          <span className={waiting >= 3 ? "font-medium text-destructive" : ""}>
            {waiting === 0
              ? "asked today"
              : `still public ${waiting} day${waiting === 1 ? "" : "s"} after asking`}
          </span>
        </p>
      </div>

      {request.contributor_note && (
        <p className="mt-3 rounded-[12px] bg-surface-muted p-3 text-sm">
          {request.contributor_note}
        </p>
      )}

      <div className="mt-3">
        <label
          htmlFor={`note-${request.request_id}`}
          className={`block ${FIELD_LABEL}`}
        >
          Note to the contributor
          <span className="ml-2 font-normal text-muted-foreground">
            Required to decline
          </span>
        </label>
        <textarea
          id={`note-${request.request_id}`}
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            if (error) setError(null);
          }}
          rows={2}
          maxLength={2000}
          aria-invalid={declining && note.trim() === ""}
          aria-describedby={error ? `error-${request.request_id}` : undefined}
          className={FIELD}
        />
      </div>

      {error && (
        <p
          id={`error-${request.request_id}`}
          role="alert"
          className="mt-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          disabled={pending}
          onClick={() => decide(true)}
          className={BUTTON_DANGER}
        >
          {pending ? "Saving…" : "Take the story down"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => decide(false)}
          className={BUTTON_OUTLINE}
        >
          Decline, and say why
        </button>
      </div>
    </li>
  );
}
