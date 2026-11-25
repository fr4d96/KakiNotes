"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { AlertCircleIcon, ChevronIcon, CloseIcon } from "@/components/icons";
import {
  BULK_APPROVE_CHUNK,
  chunk,
  type BulkApproveResult,
} from "@/lib/story/bulk-approve-chunk";
import {
  bulkApproveCautions,
  type QueueSignal,
} from "@/lib/story/moderation-queue-view";
import { BUTTON_PRIMARY, CHIP, CHIP_TONE, EMPTY_STATE, ROW_LIST } from "../ui";
import { approveStoriesAction } from "./actions";
import { QueueCover } from "./queue-cover";

/** One row, already worded by the server: nothing here formats or decides. */
export type QueueListRow = {
  /** Unique per row; a revision can appear twice under Reviewed. */
  key: string;
  revisionId: string;
  title: string;
  submitter: string;
  when: string | null;
  whenTitle: string | null;
  country: string | null;
  kind: string | null;
  source: string | null;
  decision: string | null;
  length: string;
  signals: QueueSignal[];
  isReplacement: boolean;
  openReportCount: number;
  /** Why it can't be ticked, or null when it can. */
  blockedReason: string | null;
  coverMediaId: string | null;
};

const SIGNAL_TONE = {
  alert: CHIP_TONE.alert,
  warn: "bg-surface-muted text-foreground",
  neutral: CHIP_TONE.neutral,
} as const;

/**
 * The stories queue, with a select mode for approving several at once
 * (the pattern iOS lists use: Select, tick rows, one action at the bottom).
 *
 * Stays mounted when the list empties, because approving a whole page does
 * exactly that: the action refreshes the page, the rows go, and the results
 * must still be there to read.
 */
export function QueueList({
  rows,
  selectable,
  showCovers,
  empty,
}: {
  rows: QueueListRow[];
  /** False under Reviewed, where there is nothing left to approve. */
  selectable: boolean;
  /** False when covers could not be read at all. */
  showCovers: boolean;
  empty: ReactNode;
}) {
  const { showToast } = useToast();
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  const [confirming, setConfirming] = useState(false);
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [failures, setFailures] = useState<BulkApproveResult[]>([]);
  const [published, setPublished] = useState(0);
  const listId = useId();

  const approvable = useMemo(
    () => rows.filter((row) => row.blockedReason === null),
    [rows],
  );
  // Only what is still on the page counts: a row another moderator decided
  // (or that this run just published) drops out of the selection by itself.
  const selected = approvable.filter((row) => picked.has(row.revisionId));
  const allSelected =
    approvable.length > 0 && selected.length === approvable.length;
  const busy = progress !== null;

  const cautions = bulkApproveCautions(
    selected.map((row) => ({
      is_replacement: row.isReplacement,
      open_report_count: row.openReportCount,
    })),
  );
  const countLabel =
    selected.length === 1 ? "1 story" : `${selected.length} stories`;

  function toggle(revisionId: string) {
    setPicked((before) => {
      const next = new Set(before);
      if (!next.delete(revisionId)) next.add(revisionId);
      return next;
    });
  }

  function stopSelecting() {
    setSelecting(false);
    setPicked(new Set());
  }

  async function approveSelected() {
    setConfirming(false);
    // Oldest submission first, so the newest one is also the newest story
    // on the site. The queue itself lists newest first.
    const targets = [...selected].reverse();
    const titles = new Map(targets.map((row) => [row.revisionId, row.title]));
    const total = targets.length;
    const failed: BulkApproveResult[] = [];
    let succeeded = 0;
    let done = 0;

    setFailures([]);
    setPublished(0);
    setProgress({ done: 0, total });

    for (const ids of chunk(
      targets.map((row) => row.revisionId),
      BULK_APPROVE_CHUNK,
    )) {
      let results: BulkApproveResult[];
      try {
        const response = await approveStoriesAction(ids);
        results =
          "error" in response
            ? ids.map((revisionId) => ({
                revisionId,
                title: null,
                ok: false,
                error: response.error,
              }))
            : response.results;
      } catch {
        // The reply never came. The server may well have finished, so this
        // must not claim the story failed.
        results = ids.map((revisionId) => ({
          revisionId,
          title: null,
          ok: false,
          error:
            "No reply from the server. It may have been published: check before trying again.",
        }));
      }
      for (const result of results) {
        if (result.ok) succeeded += 1;
        else {
          failed.push({
            ...result,
            title: result.title ?? titles.get(result.revisionId) ?? null,
          });
        }
      }
      done += ids.length;
      setProgress({ done, total });
    }

    setProgress(null);
    setFailures(failed);
    setPublished(succeeded);
    setPicked(new Set());
    setSelecting(false);
    if (failed.length === 0) {
      showToast(
        succeeded === 1
          ? "1 story published."
          : `${succeeded} stories published.`,
      );
    } else {
      showToast(
        `${succeeded} published, ${failed.length} not published.`,
        "error",
      );
    }
  }

  return (
    <div>
      {failures.length > 0 && (
        <section
          role="alert"
          className="mb-5 rounded-[20px] bg-surface p-4 shadow-sm sm:p-5"
        >
          <div className="flex items-start gap-3">
            <AlertCircleIcon
              aria-hidden="true"
              className="mt-0.5 h-5 w-5 shrink-0 text-destructive"
            />
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-bold">
                {failures.length === 1
                  ? "1 story was not published"
                  : `${failures.length} stories were not published`}
              </h2>
              {published > 0 && (
                <p className="text-sm text-muted-foreground">
                  {published === 1
                    ? "The other one is live."
                    : `The other ${published} are live.`}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setFailures([])}
              aria-label="Dismiss"
              className="press -mt-2 -mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-surface-muted"
            >
              <CloseIcon aria-hidden="true" className="h-5 w-5" />
            </button>
          </div>
          <ul className="mt-2 divide-y divide-border-subtle">
            {failures.map((failure) => (
              <li key={failure.revisionId} className="py-2.5">
                <Link
                  href={`/moderation/stories/${failure.revisionId}`}
                  className="press inline-flex min-h-11 items-center text-base font-semibold text-accent underline-offset-4 hover:underline"
                >
                  {failure.title ?? "Untitled story"}
                </Link>
                <p className="text-sm text-muted-foreground">{failure.error}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {selectable && approvable.length > 0 && (
        <div className="mb-2 flex min-h-11 items-center justify-between gap-3 pr-1 pl-4">
          <p className="text-sm font-bold text-muted-foreground">
            {selecting ? "Tap stories to choose them" : "Newest first"}
          </p>
          <div className="flex items-center">
            {selecting && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  setPicked(
                    allSelected
                      ? new Set()
                      : new Set(approvable.map((row) => row.revisionId)),
                  )
                }
                className="press min-h-11 rounded-full px-3 text-sm font-bold text-accent disabled:opacity-60"
              >
                {allSelected ? "Clear all" : "Select all"}
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              aria-pressed={selecting}
              aria-controls={listId}
              onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
              className="press min-h-11 rounded-full px-3 text-sm font-bold text-accent disabled:opacity-60"
            >
              {selecting ? "Done" : "Select"}
            </button>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <div className={EMPTY_STATE}>{empty}</div>
      ) : (
        <ul id={listId} className={ROW_LIST}>
          {rows.map((row) => (
            <QueueRow
              key={row.key}
              row={row}
              showCover={showCovers}
              selecting={selecting}
              checked={picked.has(row.revisionId)}
              disabled={busy}
              onToggle={() => toggle(row.revisionId)}
            />
          ))}
        </ul>
      )}

      {selecting && (
        <>
          {/* Keeps the last row clear of the floating bar. */}
          <div aria-hidden="true" className="h-24" />
          <div
            role="region"
            aria-label="Selected stories"
            data-selection-bar=""
            className="nf-glass fixed right-[max(0.75rem,env(safe-area-inset-right))] bottom-(--tab-bar-gap) left-[max(0.75rem,env(safe-area-inset-left))] z-40 mx-auto flex max-w-xl items-center gap-3 rounded-full py-2 pr-2 pl-5"
          >
            <p aria-live="polite" className="min-w-0 flex-1 text-sm font-bold">
              {progress
                ? `Publishing ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…`
                : selected.length === 0
                  ? "None selected"
                  : `${countLabel} selected`}
            </p>
            <button
              type="button"
              disabled={busy || selected.length === 0}
              onClick={() => setConfirming(true)}
              className={BUTTON_PRIMARY}
            >
              {busy ? "Publishing…" : "Approve and publish"}
            </button>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirming}
        title={`Publish ${countLabel}?`}
        description={[
          "They go live for everyone straight away, without a note to the contributors.",
          ...cautions,
        ].join(" ")}
        confirmLabel="Publish"
        cancelLabel="Cancel"
        onConfirm={() => void approveSelected()}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}

function QueueRow({
  row,
  showCover,
  selecting,
  checked,
  disabled,
  onToggle,
}: {
  row: QueueListRow;
  showCover: boolean;
  selecting: boolean;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const titleId = useId();
  const blocked = selecting && row.blockedReason !== null;

  return (
    <li
      className={`group relative flex gap-3 p-3 transition-colors sm:p-4 ${
        selecting && checked && !blocked
          ? "bg-tag-background"
          : "active:bg-surface-muted"
      }`}
    >
      {selecting && (
        <span className="flex w-6 shrink-0 items-center justify-center">
          {!blocked && (
            // Stretched over the whole row: the row is the tap target, the
            // checkbox is the control. It keeps its own focus ring through
            // the peer tick below.
            <input
              type="checkbox"
              checked={checked}
              disabled={disabled}
              onChange={onToggle}
              aria-labelledby={titleId}
              className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
            />
          )}
          <span
            aria-hidden="true"
            className={`grid h-6 w-6 place-items-center rounded-full peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent ${
              blocked
                ? "bg-surface-muted"
                : checked
                  ? "bg-accent text-accent-foreground"
                  : "border-2 border-muted-foreground/50"
            }`}
          >
            {checked && !blocked && (
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 12.5l4 4 8-9" />
              </svg>
            )}
          </span>
        </span>
      )}

      {showCover && <QueueCover mediaId={row.coverMediaId} />}

      <div className={`min-w-0 flex-1 ${blocked ? "opacity-70" : ""}`}>
        <h2
          id={titleId}
          className="line-clamp-2 text-base leading-snug font-semibold tracking-[-0.02em]"
        >
          {selecting && !blocked ? (
            row.title
          ) : (
            // Stretched link: the whole row is the tap target while the
            // accessible name stays just the title.
            <Link
              href={`/moderation/stories/${row.revisionId}`}
              // Twenty rows a page, each a server-rendered screen with its
              // own access check: preloading them all spends server time on
              // stories nobody opened.
              prefetch={false}
              className="after:absolute after:inset-0 after:content-['']"
            >
              {row.title}
            </Link>
          )}
        </h2>

        <p className="mt-0.5 text-sm text-muted-foreground">
          {row.submitter}
          {row.when && (
            <>
              {" · "}
              <span title={row.whenTitle ?? undefined}>{row.when}</span>
            </>
          )}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {[row.country, row.length].filter(Boolean).join(" · ")}
        </p>

        <ul className="mt-2 flex flex-wrap gap-1.5">
          {row.decision && (
            <li className={`${CHIP} ${CHIP_TONE.tag}`}>{row.decision}</li>
          )}
          {row.kind && (
            <li className={`${CHIP} ${CHIP_TONE.tag}`}>{row.kind}</li>
          )}
          {row.source && (
            <li className={`${CHIP} ${CHIP_TONE.neutral}`}>{row.source}</li>
          )}
          {row.signals.map((signal) => (
            <li
              key={signal.id}
              className={`${CHIP} ${SIGNAL_TONE[signal.tone]}`}
            >
              {signal.label}
            </li>
          ))}
        </ul>

        {blocked && (
          <p className="mt-2 text-sm text-destructive">{row.blockedReason}</p>
        )}
      </div>

      {!selecting && (
        <ChevronIcon
          aria-hidden="true"
          className="pointer-events-none h-4 w-4 shrink-0 self-center text-muted-foreground"
        />
      )}
    </li>
  );
}
