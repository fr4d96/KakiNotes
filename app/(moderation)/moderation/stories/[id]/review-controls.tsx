"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { AlertCircleIcon, ChevronIcon } from "@/components/icons";
import { REVISION_STATUS_LABELS } from "@/lib/story/moderation-queue-view";
import {
  BUTTON_DANGER,
  BUTTON_OUTLINE,
  BUTTON_PRIMARY,
  FIELD,
  FIELD_LABEL,
  PANEL,
} from "../../ui";
import {
  approveStoryAction,
  moderateDecisionAction,
  archiveStoryAction,
  type ModerationActionState,
} from "./actions";

const initialState: ModerationActionState = {};

/**
 * Pre-filled into the "reason shown to the contributor" box when the
 * submission has nothing to read. It is a starting point, not a decision --
 * the moderator can edit or clear it, and nothing is sent until they press
 * the button. Kept short and specific for the same reason every other
 * user-facing string in this app is: the contributor reads it verbatim.
 */
const EMPTY_CONTENT_REASON =
  "This came through without any story text — only a title. Add the story itself and submit again and we'll take another look.";

export function ReviewControls({
  revisionId,
  storyId,
  storyVersion,
  revisionStatus,
  contentIsEmpty = false,
  isReplacement = false,
  nextRevisionId = null,
}: {
  revisionId: string;
  storyId: string;
  storyVersion: number;
  revisionStatus: string;
  /**
   * True when the page decided there is nothing readable to publish (an
   * empty document, or one that could not be parsed). It never DISABLES
   * approve -- a moderator may know something this page does not, and
   * silently removing the control would be worse than warning about it --
   * it only warns, and pre-fills the request-changes reason.
   */
  contentIsEmpty?: boolean;
  /** True when approving swaps out a version readers can see now. */
  isReplacement?: boolean;
  /** Another submission waiting, offered once this one is decided. */
  nextRevisionId?: string | null;
}) {
  const [approveState, approveFormAction, approvePending] = useActionState(
    approveStoryAction,
    initialState,
  );
  const [decisionState, decisionFormAction, decisionPending] = useActionState(
    moderateDecisionAction,
    initialState,
  );
  const [archiveState, archiveFormAction, archivePending] = useActionState(
    archiveStoryAction,
    initialState,
  );
  const [showArchive, setShowArchive] = useState(false);

  const canDecide = revisionStatus === "submitted";

  // Stage 3 hardening fix: a successful approve/reject/changes-requested
  // action calls revalidatePath(), which re-fetches this page's Server
  // Component data in the SAME transition the action's own returned state
  // (approveState.success etc.) becomes visible in. That refetch changes
  // `revisionStatus` (submitted -> approved/rejected/changes_requested), so
  // `canDecide` immediately goes false -- and since the success/error
  // messages used to live INSIDE the `canDecide` branch, the confirmation
  // a moderator just triggered was replaced by the "not submitted anymore"
  // fallback text before it could ever be seen (caught live via
  // e2e/moderation.spec.ts: the approve/reject specs timed out waiting for
  // role="status"). Fixed by rendering any pending success/error message
  // for either action UNCONDITIONALLY, above the canDecide branch, so it
  // survives the moment the surrounding form/section disappears.
  // Note: with two independent forms/action states and no ordering signal
  // between them, this prioritizes approve's message over decision's if a
  // moderator somehow triggers both without a reload in between (rare in
  // practice -- the "not submitted anymore" fallback also appears the
  // moment either one succeeds, telling them a decision was already made).
  const decisionMessage =
    approveState.success ??
    approveState.error ??
    decisionState.success ??
    decisionState.error ??
    null;
  const decisionMessageIsError = Boolean(
    approveState.error || decisionState.error,
  );

  const decided = Boolean(approveState.success || decisionState.success);

  return (
    <section aria-label="Decision" className="space-y-5">
      <h2 className="text-xl font-extrabold tracking-[-0.025em]">Decision</h2>

      {decisionMessage && (
        <div className={PANEL}>
          <p
            role={decisionMessageIsError ? "alert" : "status"}
            className={`text-base font-semibold ${
              decisionMessageIsError ? "text-destructive" : "text-fern"
            }`}
          >
            {decisionMessage}
          </p>
          {decided && (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              {nextRevisionId && (
                <Link
                  href={`/moderation/stories/${nextRevisionId}`}
                  className={BUTTON_PRIMARY}
                >
                  Review the next story
                </Link>
              )}
              <Link href="/moderation/stories" className={BUTTON_OUTLINE}>
                Back to the queue
              </Link>
            </div>
          )}
        </div>
      )}

      {canDecide ? (
        // Request changes comes FIRST when there is nothing to publish.
        // Reading order is the recommendation: the most likely correct
        // action for this submission sits at the top of the column.
        <div
          className={`flex gap-5 ${contentIsEmpty ? "flex-col-reverse" : "flex-col"}`}
        >
          <div className={PANEL}>
            <h3 className="text-base font-bold">Publish it</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {isReplacement
                ? "This version takes the place of the live one straight away."
                : "The story and its photos go live for everyone straight away."}
            </p>
            {contentIsEmpty && (
              <p className="mt-3 flex items-start gap-2 rounded-2xl bg-destructive/10 px-3 py-2.5 text-sm font-semibold text-destructive">
                <AlertCircleIcon
                  aria-hidden="true"
                  className="mt-0.5 h-4 w-4 shrink-0"
                />
                There is nothing readable to publish here. Approving would put
                an empty story live.
              </p>
            )}
            <form action={approveFormAction} className="mt-4">
              <input type="hidden" name="revisionId" value={revisionId} />
              <input type="hidden" name="storyId" value={storyId} />
              <button
                type="submit"
                disabled={approvePending}
                className={`${BUTTON_PRIMARY} w-full sm:w-auto`}
              >
                {approvePending ? "Approving…" : "Approve and publish"}
              </button>
              {/* Closed: most approvals carry no note at all. */}
              <details className="group/notes mt-2">
                <summary className="press flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-sm font-bold text-muted-foreground [&::-webkit-details-marker]:hidden">
                  Add a note
                  <ChevronIcon
                    aria-hidden="true"
                    className="h-3.5 w-3.5 transition-transform group-open/notes:rotate-90 motion-reduce:transition-none"
                  />
                </summary>
                <div className="space-y-4 pt-1">
                  <label className="block">
                    <span className={FIELD_LABEL}>
                      Note to the contributor (optional)
                    </span>
                    <textarea
                      name="userFacingReason"
                      rows={2}
                      className={FIELD}
                    />
                  </label>
                  <label className="block">
                    <span className={FIELD_LABEL}>
                      Internal note (optional, staff only)
                    </span>
                    <textarea name="editorNote" rows={2} className={FIELD} />
                  </label>
                </div>
              </details>
            </form>
          </div>

          <div className={PANEL}>
            <h3 className="text-base font-bold">Send it back or reject it</h3>
            {contentIsEmpty && (
              <p className="mt-1 text-sm text-muted-foreground">
                Suggested for this submission. A reason is filled in below and
                you can edit it before sending.
              </p>
            )}
            <form action={decisionFormAction} className="mt-3 space-y-4">
              <input type="hidden" name="revisionId" value={revisionId} />
              <input
                type="hidden"
                name="expectedVersion"
                value={storyVersion}
              />
              <label className="block">
                <span className={FIELD_LABEL}>Decision</span>
                <select name="decision" className={FIELD}>
                  <option value="changes_requested">Request changes</option>
                  <option value="reject">Reject</option>
                </select>
              </label>
              <label className="block">
                <span className={FIELD_LABEL}>
                  Reason shown to the contributor (required)
                </span>
                <textarea
                  name="userFacingReason"
                  rows={3}
                  required
                  defaultValue={contentIsEmpty ? EMPTY_CONTENT_REASON : ""}
                  placeholder="Reason shown to the contributor (required)"
                  className={FIELD}
                />
              </label>
              <label className="block">
                <span className={FIELD_LABEL}>
                  Internal note (optional, staff only)
                </span>
                <textarea name="editorNote" rows={2} className={FIELD} />
              </label>
              <button
                type="submit"
                disabled={decisionPending}
                className={`${BUTTON_OUTLINE} w-full sm:w-auto`}
              >
                {decisionPending ? "Submitting…" : "Submit decision"}
              </button>
            </form>
          </div>
        </div>
      ) : (
        !decided && (
          <p className={`${PANEL} text-sm text-muted-foreground`}>
            Nothing to decide here: this version is marked &ldquo;
            {REVISION_STATUS_LABELS[revisionStatus] ?? revisionStatus}&rdquo;.
          </p>
        )
      )}

      <div className="rounded-[20px] bg-surface shadow-sm">
        <button
          type="button"
          onClick={() => setShowArchive((v) => !v)}
          aria-expanded={showArchive}
          className="press flex min-h-13 w-full items-center gap-2 px-4 text-left text-base font-medium text-destructive sm:px-5"
        >
          <span className="flex-1">Archive / unpublish this story</span>
          <ChevronIcon
            aria-hidden="true"
            className={`h-4 w-4 transition-transform motion-reduce:transition-none ${showArchive ? "rotate-90" : ""}`}
          />
        </button>
        {showArchive && (
          <form
            action={archiveFormAction}
            className="space-y-4 px-4 pt-1 pb-4 sm:px-5"
          >
            <input type="hidden" name="storyId" value={storyId} />
            <input type="hidden" name="revisionId" value={revisionId} />
            <input type="hidden" name="expectedVersion" value={storyVersion} />
            <label className="block">
              <span className={FIELD_LABEL}>Reason (required)</span>
              <textarea
                name="reason"
                rows={2}
                required
                placeholder="Reason (required)"
                className={FIELD}
              />
            </label>
            <label className="block">
              <span className={FIELD_LABEL}>Internal note (optional)</span>
              <textarea name="note" rows={2} className={FIELD} />
            </label>
            <button
              type="submit"
              disabled={archivePending}
              className={`${BUTTON_DANGER} w-full sm:w-auto`}
            >
              {archivePending ? "Archiving…" : "Archive story"}
            </button>
            {archiveState.error && (
              <p role="alert" className="text-sm text-destructive">
                {archiveState.error}
              </p>
            )}
            {archiveState.success && (
              <p role="status" className="text-sm text-muted-foreground">
                {archiveState.success}
              </p>
            )}
          </form>
        )}
      </div>
    </section>
  );
}
