"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  finishDriveMoveAction,
  moveNextDrivePhotoAction,
  startDriveMoveAction,
} from "@/app/(contributor)/account/drive/move-actions";
import type { DriveMoveSummary } from "@/lib/story/media-move";

type Failure = { storyTitle: string; reason: string };

type Phase =
  | { kind: "idle" }
  | { kind: "running"; done: number; total: number; stopping: boolean }
  | { kind: "finished"; moved: number; failures: Failure[]; error?: string };

/**
 * "Move my existing photos to Drive" on Account -> Google Drive
 * (docs/google-drive-integration.md section 9). The browser runs the loop:
 * start, then one Server Action per photo, then finish. Closing the tab
 * just pauses it -- every photo is either fully moved or fully still on
 * Kakinotes -- and pressing the button again carries on.
 */
export function DriveMovePanel({ summary }: { summary: DriveMoveSummary }) {
  const t = useTranslations("account.drive.move");
  const [confirmed, setConfirmed] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const stopRequested = useRef(false);

  const running = phase.kind === "running";

  // Warn before leaving mid-move. Leaving is safe (the move pauses), but
  // the contributor should know it stops.
  useEffect(() => {
    if (!running) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [running]);

  async function run() {
    stopRequested.current = false;
    // Show progress straight away, which also hides the button so a double
    // click can't start a second run.
    setPhase({
      kind: "running",
      done: 0,
      total: summary.movableCount,
      stopping: false,
    });
    const started = await startDriveMoveAction();
    if (!started.ok) {
      setPhase({
        kind: "finished",
        moved: 0,
        failures: [],
        error: started.error,
      });
      return;
    }

    let moved = 0;
    let done = 0;
    const failures: Failure[] = [];
    let error: string | undefined;
    setPhase({
      kind: "running",
      done,
      total: started.total,
      // Stop may already have been pressed while the run was starting.
      stopping: stopRequested.current,
    });

    while (!stopRequested.current) {
      const step = await moveNextDrivePhotoAction(started.runId);
      if (!step.ok) {
        error = step.error;
        break;
      }
      if (step.done) break;
      done += 1;
      if (step.moved) {
        moved += 1;
      } else {
        failures.push({ storyTitle: step.storyTitle, reason: step.reason });
      }
      setPhase({
        kind: "running",
        done,
        total: Math.max(started.total, done),
        stopping: stopRequested.current,
      });
    }

    const finished = await finishDriveMoveAction(started.runId);
    if (!finished.ok && !error) error = finished.error;
    setPhase({ kind: "finished", moved, failures, error });
    setConfirmed(false);
  }

  function stop() {
    stopRequested.current = true;
    setPhase((current) =>
      current.kind === "running" ? { ...current, stopping: true } : current,
    );
  }

  const hasPhotos = summary.movableCount > 0;
  const hasCleanup = summary.cleanupPendingCount > 0;

  return (
    <section
      aria-labelledby="drive-move-title"
      className="rounded-md border border-border-subtle p-4 text-sm"
    >
      <h3 id="drive-move-title" className="font-medium">
        {t("title")}
      </h3>

      {phase.kind === "running" ? (
        <div className="mt-3 space-y-3">
          <p role="status" aria-live="polite">
            {phase.stopping
              ? t("stopping")
              : t("progress", { done: phase.done, total: phase.total })}
          </p>
          <progress
            className="h-2 w-full"
            max={phase.total || 1}
            value={phase.done}
            aria-label={t("progressLabel")}
          />
          <p className="text-foreground/65">{t("keepOpen")}</p>
          <button
            type="button"
            onClick={stop}
            disabled={phase.stopping}
            className="journiq-button border border-border-subtle text-sm disabled:opacity-60"
          >
            {t("stop")}
          </button>
        </div>
      ) : (
        <div className="mt-2 space-y-3">
          {phase.kind === "finished" && (
            <div role="status" className="space-y-2">
              {phase.error && (
                <p role="alert" className="text-destructive">
                  {phase.error}
                </p>
              )}
              {phase.moved > 0 && (
                <p className="text-fern">
                  {t("movedCount", { count: phase.moved })}
                </p>
              )}
              {phase.failures.length > 0 && (
                <div>
                  <p>{t("failedCount", { count: phase.failures.length })}</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-foreground/70">
                    {phase.failures.map((failure, index) => (
                      <li key={index}>
                        {t("failedItem", {
                          story: failure.storyTitle,
                          reason: failure.reason,
                        })}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {summary.runInProgress && phase.kind === "idle" && (
            <p className="text-foreground/65">{t("runningElsewhere")}</p>
          )}

          {hasPhotos ? (
            <>
              <p className="text-foreground/70">
                {t("explainer", { count: summary.movableCount })}
              </p>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                  className="mt-0.5"
                />
                <span>{t("confirmLabel")}</span>
              </label>
              <button
                type="button"
                onClick={run}
                disabled={!confirmed}
                className="journiq-button bg-accent text-sm text-accent-foreground disabled:opacity-60"
              >
                {t("start", { count: summary.movableCount })}
              </button>
            </>
          ) : hasCleanup ? (
            <>
              <p className="text-foreground/70">
                {t("cleanupExplainer", { count: summary.cleanupPendingCount })}
              </p>
              <button
                type="button"
                onClick={run}
                className="journiq-button bg-accent text-sm text-accent-foreground"
              >
                {t("cleanup")}
              </button>
            </>
          ) : (
            <p className="text-foreground/70">{t("nothingToMove")}</p>
          )}
        </div>
      )}
    </section>
  );
}
