"use client";

import { useActionState, useId } from "react";
import {
  BUG_REPORT_STATUSES,
  type BugReportStatus,
} from "@/lib/validation/bug-report";
import { BUG_STATUS_LABELS } from "./labels";
import {
  updateBugReportStatusAction,
  type BugStatusActionState,
} from "./actions";

/** One report's status picker. The report id is re-validated server-side. */
export function BugStatusForm({
  reportId,
  status,
}: {
  reportId: string;
  status: BugReportStatus;
}) {
  const [state, formAction, pending] = useActionState<
    BugStatusActionState,
    FormData
  >(updateBugReportStatusAction, {});
  const selectId = useId();

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="reportId" value={reportId} />
      <label htmlFor={selectId} className="text-sm text-muted-foreground">
        Status
      </label>
      <select
        id={selectId}
        name="status"
        defaultValue={status}
        className="min-h-11 rounded-md border border-border-subtle bg-surface px-2 text-sm"
      >
        {BUG_REPORT_STATUSES.map((value) => (
          <option key={value} value={value}>
            {BUG_STATUS_LABELS[value]}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        className="min-h-11 rounded-md border border-border-subtle px-3 text-sm font-medium disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save"}
      </button>
      <span aria-live="polite" className="text-sm">
        {state.error ? (
          <span className="text-destructive">{state.error}</span>
        ) : state.success ? (
          <span className="text-muted-foreground">{state.success}</span>
        ) : null}
      </span>
    </form>
  );
}
