"use client";

import { useActionState, useState } from "react";
import { reportNoteRequired } from "@/lib/validation/moderation";
import {
  BUTTON_PRIMARY,
  FIELD,
  FIELD_LABEL,
} from "@/app/(moderation)/moderation/ui";
import { resolveReportAction, type ResolveReportActionState } from "./actions";

const initialState: ResolveReportActionState = {};

/**
 * Status transition + internal-note form. The note becomes required
 * (client-side only, via reportNoteRequired() -- resolve_report() itself
 * is the real, non-bypassable enforcement per Engineering Rule 3) whenever
 * the selected target status is resolved/dismissed AND the report's own
 * category is one of the four serious ones. Never disabled/hidden for
 * reviewing, since that transition never requires a note regardless of
 * category.
 */
export function ResolveReportForm({
  reportId,
  category,
  currentStatus,
}: {
  reportId: string;
  category: string;
  currentStatus: string;
}) {
  const [state, formAction, pending] = useActionState(
    resolveReportAction,
    initialState,
  );
  const [status, setStatus] = useState<"reviewing" | "resolved" | "dismissed">(
    currentStatus === "open" || currentStatus === "reviewing"
      ? "reviewing"
      : "resolved",
  );

  const noteRequired = reportNoteRequired(category, status);
  const alreadyClosed =
    currentStatus === "resolved" || currentStatus === "dismissed";

  // Stage 3 hardening fix (found live, same root cause as
  // app/(moderation)/moderation/stories/[id]/review-controls.tsx's own fix):
  // a successful resolve action calls revalidatePath(), which re-fetches
  // this page's Server Component data in the same transition the action's
  // own returned success/error state becomes visible in. That refetch
  // changes `currentStatus` to resolved/dismissed, so `alreadyClosed`
  // immediately becomes true -- and since this early-return used to replace
  // the ENTIRE form (including the success/error message) with the
  // "already closed" fallback, the confirmation a moderator just triggered
  // was never actually observable. Rendered unconditionally, above the
  // alreadyClosed early return, so it survives that moment.
  const message = state.success ?? state.error ?? null;

  if (alreadyClosed) {
    return (
      <>
        {message && (
          <p
            role={state.error ? "alert" : "status"}
            className={
              state.error ? "text-sm text-destructive" : "text-sm text-fern"
            }
          >
            {message}
          </p>
        )}
        <p className="mt-2 text-sm text-muted-foreground">
          This report is already {currentStatus}. A closed report can&rsquo;t be
          reopened.
        </p>
      </>
    );
  }

  return (
    <form action={formAction} className="mt-3 space-y-3">
      <input type="hidden" name="reportId" value={reportId} />
      <label className={`block ${FIELD_LABEL}`}>
        Status
        <select
          name="status"
          value={status}
          onChange={(e) =>
            setStatus(e.target.value as "reviewing" | "resolved" | "dismissed")
          }
          className={FIELD}
        >
          <option value="reviewing">Mark as reviewing</option>
          <option value="resolved">Resolve</option>
          <option value="dismissed">Dismiss</option>
        </select>
      </label>
      <label className={`block ${FIELD_LABEL}`}>
        Internal note (staff only — never shown to the reporter)
        <textarea
          name="internalNote"
          rows={3}
          required={noteRequired}
          placeholder={
            noteRequired
              ? "Required for this category when closing a report (e.g. what was verified, what action was taken)."
              : "Optional"
          }
          className={FIELD}
        />
        {noteRequired && (
          <span className="mt-1 block text-sm text-destructive">
            A note is required to {status} a report in this category.
          </span>
        )}
      </label>
      <button type="submit" disabled={pending} className={BUTTON_PRIMARY}>
        {pending ? "Saving…" : "Save"}
      </button>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="text-sm text-fern">
          {state.success}
        </p>
      )}
    </form>
  );
}
