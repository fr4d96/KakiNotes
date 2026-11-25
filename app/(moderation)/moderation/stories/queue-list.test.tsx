import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/i18n/messages/en.json";

const mockApprove = vi.fn();
vi.mock("./actions", () => ({
  approveStoriesAction: (ids: string[]) => mockApprove(ids),
}));
vi.mock("./queue-cover", () => ({ QueueCover: () => null }));

import { QueueList, type QueueListRow } from "./queue-list";

function row(n: number, overrides: Partial<QueueListRow> = {}): QueueListRow {
  return {
    key: `r${n}`,
    revisionId: `r${n}`,
    title: `Story ${n}`,
    submitter: "Mei",
    when: "2 hours ago",
    whenTitle: null,
    country: "New Zealand",
    kind: "First submission",
    source: null,
    decision: null,
    length: "900 characters",
    signals: [],
    isReplacement: false,
    openReportCount: 0,
    blockedReason: null,
    coverMediaId: null,
    ...overrides,
  };
}

function ui(rows: QueueListRow[], selectable = true) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <QueueList
        rows={rows}
        selectable={selectable}
        showCovers={false}
        empty={<p>Nothing is waiting on a decision.</p>}
      />
    </NextIntlClientProvider>
  );
}

const succeed = async (ids: string[]) => ({
  results: ids.map((revisionId) => ({ revisionId, title: null, ok: true })),
});

async function publish(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Approve and publish" }));
  await user.click(screen.getByRole("button", { name: "Publish" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockApprove.mockImplementation(succeed);
  // jsdom has no modal dialogs.
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});

describe("QueueList", () => {
  it("opens stories until Select is pressed, and offers no bulk bar", () => {
    render(ui([row(1)]));
    expect(screen.getByRole("link", { name: "Story 1" })).toHaveAttribute(
      "href",
      "/moderation/stories/r1",
    );
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Approve and publish" }),
    ).toBeNull();
  });

  it("has no Select under Reviewed", () => {
    render(ui([row(1)], false));
    expect(screen.queryByRole("button", { name: "Select" })).toBeNull();
  });

  it("asks first, then publishes only the ticked stories, oldest first", async () => {
    const user = userEvent.setup();
    render(ui([row(1), row(2), row(3)]));
    await user.click(screen.getByRole("button", { name: "Select" }));
    expect(
      screen.getByRole("button", { name: "Approve and publish" }),
    ).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: "Story 1" }));
    await user.click(screen.getByRole("checkbox", { name: "Story 3" }));
    await user.click(
      screen.getByRole("button", { name: "Approve and publish" }),
    );
    expect(screen.getByText("Publish 2 stories?")).toBeInTheDocument();
    expect(mockApprove).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(mockApprove).toHaveBeenCalledWith(["r3", "r1"]));
  });

  it("selects all that can be published, never a blocked one", async () => {
    const user = userEvent.setup();
    render(ui([row(1), row(2, { blockedReason: "Nothing to publish." })]));
    await user.click(screen.getByRole("button", { name: "Select" }));
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    expect(screen.getByText("Nothing to publish.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Select all" }));
    await publish(user);
    await waitFor(() => expect(mockApprove).toHaveBeenCalledWith(["r1"]));
  });

  it("sends a long selection in small requests", async () => {
    const user = userEvent.setup();
    render(ui(Array.from({ length: 9 }, (_, i) => row(i + 1))));
    await user.click(screen.getByRole("button", { name: "Select" }));
    await user.click(screen.getByRole("button", { name: "Select all" }));
    await publish(user);
    await waitFor(() => expect(mockApprove).toHaveBeenCalledTimes(3));
    expect(mockApprove.mock.calls.map((c) => c[0].length)).toEqual([4, 4, 1]);
  });

  it("warns about replacing live stories and open reports", async () => {
    const user = userEvent.setup();
    render(
      ui([row(1, { isReplacement: true }), row(2, { openReportCount: 1 })]),
    );
    await user.click(screen.getByRole("button", { name: "Select" }));
    await user.click(screen.getByRole("button", { name: "Select all" }));
    await user.click(
      screen.getByRole("button", { name: "Approve and publish" }),
    );
    expect(
      screen.getByText(/1 replaces a story that is live now/),
    ).toHaveTextContent(/1 has an open reader report/);
  });

  it("keeps the failures on screen after the list refreshes empty", async () => {
    mockApprove.mockResolvedValue({
      results: [
        { revisionId: "r2", title: "Story 2", ok: true },
        {
          revisionId: "r1",
          title: "Story 1",
          ok: false,
          error: "No valid consent on file.",
        },
      ],
    });
    const user = userEvent.setup();
    const { rerender } = render(ui([row(1), row(2)]));
    await user.click(screen.getByRole("button", { name: "Select" }));
    await user.click(screen.getByRole("button", { name: "Select all" }));
    await publish(user);
    await screen.findByRole("alert");
    rerender(ui([]));
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("1 story was not published");
    expect(alert).toHaveTextContent("No valid consent on file.");
    expect(
      within(alert).getByRole("link", { name: "Story 1" }),
    ).toHaveAttribute("href", "/moderation/stories/r1");
    expect(
      screen.getByText("Nothing is waiting on a decision."),
    ).toBeInTheDocument();
  });

  it("does not claim failure when the server's reply is lost", async () => {
    mockApprove.mockRejectedValue(new Error("network"));
    const user = userEvent.setup();
    render(ui([row(1)]));
    await user.click(screen.getByRole("button", { name: "Select" }));
    await user.click(screen.getByRole("checkbox", { name: "Story 1" }));
    await publish(user);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "It may have been published",
    );
  });
});
