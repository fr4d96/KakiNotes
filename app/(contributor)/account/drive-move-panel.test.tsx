import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const startDriveMoveAction = vi.hoisted(() => vi.fn());
const moveNextDrivePhotoAction = vi.hoisted(() => vi.fn());
const finishDriveMoveAction = vi.hoisted(() => vi.fn());
const cleanUpOldCopiesAction = vi.hoisted(() => vi.fn());
vi.mock("@/app/(contributor)/account/drive/move-actions", () => ({
  cleanUpOldCopiesAction,
  startDriveMoveAction,
  moveNextDrivePhotoAction,
  finishDriveMoveAction,
}));

import { DriveMovePanel } from "@/app/(contributor)/account/drive-move-panel";

const RUN = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  startDriveMoveAction.mockReset();
  moveNextDrivePhotoAction.mockReset();
  finishDriveMoveAction.mockReset();
  finishDriveMoveAction.mockResolvedValue({ ok: true });
  cleanUpOldCopiesAction.mockReset();
});

describe("DriveMovePanel", () => {
  it("keeps the move button disabled until the no-copy warning is ticked", () => {
    render(
      <DriveMovePanel
        summary={{
          movableCount: 3,
          cleanupPendingCount: 0,
          runInProgress: false,
        }}
      />,
    );
    const button = screen.getByRole("button", {
      name: /move 3 photos to drive/i,
    });
    expect(button).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(button).toBeEnabled();
  });

  it("moves photo by photo, then lists what moved and what couldn't", async () => {
    startDriveMoveAction.mockResolvedValue({ ok: true, runId: RUN, total: 2 });
    moveNextDrivePhotoAction
      .mockResolvedValueOnce({ ok: true, done: false, moved: true })
      .mockResolvedValueOnce({
        ok: true,
        done: false,
        moved: false,
        storyTitle: "Kiwi orchard summer",
        reason:
          "its story is being published right now. Try again in a few minutes.",
      })
      .mockResolvedValueOnce({ ok: true, done: true });

    render(
      <DriveMovePanel
        summary={{
          movableCount: 2,
          cleanupPendingCount: 0,
          runInProgress: false,
        }}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /move 2 photos/i }));

    expect(
      await screen.findByText(/moved 1 photo to your drive/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/1 photo couldn't be moved/i)).toBeInTheDocument();
    expect(
      screen.getByText(/kiwi orchard summer: its story/i),
    ).toBeInTheDocument();
    expect(moveNextDrivePhotoAction).toHaveBeenCalledTimes(3);
    expect(moveNextDrivePhotoAction).toHaveBeenCalledWith(RUN);
    expect(finishDriveMoveAction).toHaveBeenCalledWith(RUN);
  });

  it("stops at a run-ending error, still closes the run, and shows the error", async () => {
    startDriveMoveAction.mockResolvedValue({ ok: true, runId: RUN, total: 5 });
    moveNextDrivePhotoAction.mockResolvedValueOnce({
      ok: false,
      error: "Your Google Drive isn't connected any more.",
    });

    render(
      <DriveMovePanel
        summary={{
          movableCount: 5,
          cleanupPendingCount: 0,
          runInProgress: false,
        }}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /move 5 photos/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /isn't connected any more/i,
    );
    expect(moveNextDrivePhotoAction).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(finishDriveMoveAction).toHaveBeenCalledWith(RUN),
    );
  });

  it("keeps showing 'stopping' when Stop is pressed while the run is starting", async () => {
    let resolveStart: (value: unknown) => void = () => {};
    startDriveMoveAction.mockReturnValue(
      new Promise((resolve) => {
        resolveStart = resolve;
      }),
    );

    render(
      <DriveMovePanel
        summary={{
          movableCount: 4,
          cleanupPendingCount: 0,
          runInProgress: false,
        }}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /move 4 photos/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /stop after this photo/i }),
    );
    resolveStart({ ok: true, runId: RUN, total: 4 });

    await waitFor(() =>
      expect(finishDriveMoveAction).toHaveBeenCalledWith(RUN),
    );
    // Nothing was claimed: the stop landed before the first photo.
    expect(moveNextDrivePhotoAction).not.toHaveBeenCalled();
  });

  it("offers to delete old copies when only cleanup is left", () => {
    render(
      <DriveMovePanel
        summary={{
          movableCount: 0,
          cleanupPendingCount: 2,
          runInProgress: false,
        }}
      />,
    );
    expect(
      screen.getByRole("button", { name: /delete kakinotes' old copies/i }),
    ).toBeEnabled();
    expect(
      screen.getByText(/2 published photos have moved/i),
    ).toBeInTheDocument();
  });

  it("deletes old copies over several calls until none are left, without starting a move", async () => {
    cleanUpOldCopiesAction
      .mockResolvedValueOnce({ ok: true, deleted: 3, remaining: 2 })
      .mockResolvedValueOnce({ ok: true, deleted: 2, remaining: 0 });

    render(
      <DriveMovePanel
        summary={{
          movableCount: 0,
          cleanupPendingCount: 5,
          runInProgress: false,
        }}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /delete kakinotes' old copies/i }),
    );

    expect(
      await screen.findByText(/deleted 5 old copies from kakinotes/i),
    ).toBeInTheDocument();
    expect(cleanUpOldCopiesAction).toHaveBeenCalledTimes(2);
    expect(startDriveMoveAction).not.toHaveBeenCalled();
    expect(screen.queryByText(/moved 0 of 0/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /delete kakinotes' old copies/i }),
    ).not.toBeInTheDocument();
  });

  it("stops when a call deletes nothing, and says how many are left", async () => {
    cleanUpOldCopiesAction
      .mockResolvedValueOnce({ ok: true, deleted: 1, remaining: 2 })
      .mockResolvedValueOnce({ ok: true, deleted: 0, remaining: 2 });

    render(
      <DriveMovePanel
        summary={{
          movableCount: 0,
          cleanupPendingCount: 3,
          runInProgress: false,
        }}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /delete kakinotes' old copies/i }),
    );

    expect(
      await screen.findByText(/2 old copies couldn.t be deleted yet/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/deleted 1 old copy from kakinotes/i),
    ).toBeInTheDocument();
    expect(cleanUpOldCopiesAction).toHaveBeenCalledTimes(2);
    // Still offered, so it can be tried again later.
    expect(
      screen.getByRole("button", { name: /delete kakinotes' old copies/i }),
    ).toBeInTheDocument();
  });

  it("says when there is nothing to move", () => {
    render(
      <DriveMovePanel
        summary={{
          movableCount: 0,
          cleanupPendingCount: 0,
          runInProgress: false,
        }}
      />,
    );
    expect(
      screen.getByText(/no photos on kakinotes to move/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
