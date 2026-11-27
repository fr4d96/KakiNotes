import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { NotificationRow } from "@/lib/notifications/notification-view";

const { markReadMock, loadMoreMock } = vi.hoisted(() => ({
  markReadMock: vi.fn(),
  loadMoreMock: vi.fn(),
}));

// Same "use server" / server-only jsdom incompatibility every component
// test importing a Server Action works around (see site-header.test.tsx).
vi.mock("./actions", () => ({
  markNotificationsReadAction: markReadMock,
  loadMoreNotificationsAction: loadMoreMock,
}));

import { NOTIFICATIONS_CHANGED_EVENT } from "@/lib/notifications/notifications-changed";
import { NotificationsList } from "./notifications-list";

const NOW = "2026-09-12T12:00:00Z";

const rows: NotificationRow[] = [
  {
    id: "n1",
    kind: "story_changes_requested",
    story_id: "s1",
    revision_id: "r1",
    story_title: "Hostel work in Queenstown",
    story_slug: "hostel-queenstown-ghi",
    reason: "Could you add roughly what the hostel paid per week?",
    read_at: null,
    created_at: "2026-09-12T11:48:00Z",
  },
  {
    id: "n2",
    kind: "story_published",
    story_id: "s2",
    revision_id: "r2",
    story_title: "Opotiki Trip",
    story_slug: "opotiki-trip-2f2754f0",
    reason: null,
    read_at: "2026-09-12T09:00:00Z",
    created_at: "2026-09-12T09:00:00Z",
  },
];

/** One page with nothing after it -- what most of these tests need. */
function onePage(list: NotificationRow[]) {
  return { rows: list, nextCursor: null };
}

beforeEach(() => {
  markReadMock.mockReset();
  loadMoreMock.mockReset();
});

describe("NotificationsList", () => {
  it("tells the reader what is waiting, and links each row to its own place", () => {
    render(
      <NotificationsList
        initialPage={onePage(rows)}
        unreadCount={1}
        now={NOW}
      />,
    );

    expect(screen.getByText("1 unread")).toBeInTheDocument();

    const changes = screen.getByRole("link", {
      name: /Changes requested on your story/,
    });
    expect(changes).toHaveAttribute("href", "/my-stories");
    expect(
      screen.getByText("Could you add roughly what the hostel paid per week?"),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("link", { name: /Your story is live/ }),
    ).toHaveAttribute("href", "/stories/opotiki-trip-2f2754f0");
  });

  it("marks unread rows for assistive tech and gives only those a Mark read button", () => {
    render(
      <NotificationsList
        initialPage={onePage(rows)}
        unreadCount={1}
        now={NOW}
      />,
    );

    expect(
      screen.getByRole("link", { name: /Changes requested on your story/ }),
    ).toHaveTextContent("(unread)");
    expect(
      screen.getByRole("link", { name: /Your story is live/ }),
    ).not.toHaveTextContent("(unread)");

    // One per-row button (the unread row) plus the global one.
    expect(screen.getAllByRole("button", { name: "Mark read" })).toHaveLength(
      1,
    );
    expect(
      screen.getByRole("button", { name: "Mark all as read" }),
    ).toBeInTheDocument();
  });

  it("carries the row's id in its own form, and nothing in the mark-all form", () => {
    const { container } = render(
      <NotificationsList
        initialPage={onePage(rows)}
        unreadCount={1}
        now={NOW}
      />,
    );
    const ids = Array.from(
      container.querySelectorAll<HTMLInputElement>(
        'input[name="notificationId"]',
      ),
    ).map((input) => input.value);
    // Exactly the unread row -- an empty mark-all form is what means "all".
    expect(ids).toEqual(["n1"]);
  });

  it("hides both mark-read affordances once everything is read", () => {
    const allRead = rows.map((row) => ({
      ...row,
      read_at: row.read_at ?? NOW,
    }));
    render(
      <NotificationsList
        initialPage={onePage(allRead)}
        unreadCount={0}
        now={NOW}
      />,
    );

    expect(screen.getByText("Nothing unread")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Mark all as read" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Mark read" }),
    ).not.toBeInTheDocument();
  });

  it("renders relative ages from the server's clock, not the browser's", () => {
    render(
      <NotificationsList
        initialPage={onePage(rows)}
        unreadCount={1}
        now={NOW}
      />,
    );
    expect(screen.getByText("12 min ago")).toBeInTheDocument();
    expect(screen.getByText("3 hours ago")).toBeInTheDocument();
  });

  it("shows a real empty state rather than a bare page", () => {
    render(
      <NotificationsList initialPage={onePage([])} unreadCount={0} now={NOW} />,
    );
    expect(screen.getByText("Nothing here yet")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Go to My Stories" }),
    ).toHaveAttribute("href", "/my-stories");
    expect(
      screen.queryByRole("button", { name: "Mark all as read" }),
    ).not.toBeInTheDocument();
  });

  it("tells the header bell to re-count after a successful mark-read", async () => {
    const heard = vi.fn();
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, heard);
    // The action's real return shape: markedAt changes on every success,
    // which is what the list keys its event off.
    markReadMock.mockResolvedValue({ markedAt: "2026-09-12T12:00:01Z" });

    render(
      <NotificationsList
        initialPage={onePage(rows)}
        unreadCount={1}
        now={NOW}
      />,
    );
    expect(heard).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Mark all as read" }));
    await waitFor(() => expect(heard).toHaveBeenCalledTimes(1));

    window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, heard);
  });

  it("stays quiet when the action fails", async () => {
    const heard = vi.fn();
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, heard);
    markReadMock.mockResolvedValue({
      error: "Could not update notifications.",
    });

    render(
      <NotificationsList
        initialPage={onePage(rows)}
        unreadCount={1}
        now={NOW}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Mark all as read" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not update notifications.",
    );
    expect(heard).not.toHaveBeenCalled();

    window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, heard);
  });

  describe("See more", () => {
    // Rows as Postgres returns them: created_at with "+00:00", not "Z" --
    // the cursor must carry that string through untouched.
    function row(i: number, unread = false): NotificationRow {
      const minute = String(59 - (i % 60)).padStart(2, "0");
      const hour = String(23 - Math.floor(i / 60)).padStart(2, "0");
      return {
        ...rows[1],
        id: `00000000-0000-4000-8000-${String(1000 + i).padStart(12, "0")}`,
        story_title: `Story ${i}`,
        read_at: unread ? null : "2026-09-12T09:00:00+00:00",
        created_at: `2026-09-11T${hour}:${minute}:00+00:00`,
      };
    }
    const range = (from: number, to: number, unread = false) =>
      Array.from({ length: to - from }, (_, k) => row(from + k, unread));
    const cursorAfter = (r: NotificationRow) => ({
      createdAt: r.created_at,
      id: r.id,
    });
    const shownTitles = () =>
      screen
        .getAllByText(/^\u201cStory \d+\u201d$/)
        .map((node) => node.textContent);
    const page1 = range(0, 20);

    it("renders the first page and offers more when the server says there is more", () => {
      render(
        <NotificationsList
          initialPage={{ rows: page1, nextCursor: cursorAfter(page1[19]) }}
          unreadCount={0}
          now={NOW}
        />,
      );
      expect(shownTitles()).toHaveLength(20);
      expect(
        screen.getByRole("button", { name: "See more" }),
      ).toBeInTheDocument();
      expect(loadMoreMock).not.toHaveBeenCalled();
    });

    it("asks the server for the rows after the last one shown, and appends them", async () => {
      const page2 = range(20, 40);
      loadMoreMock.mockResolvedValue({
        rows: page2,
        nextCursor: cursorAfter(page2[19]),
      });
      render(
        <NotificationsList
          initialPage={{ rows: page1, nextCursor: cursorAfter(page1[19]) }}
          unreadCount={0}
          now={NOW}
        />,
      );
      const status = screen.getByRole("status");
      expect(status).toHaveAttribute("aria-live", "polite");
      expect(status).toBeEmptyDOMElement();

      fireEvent.click(screen.getByRole("button", { name: "See more" }));

      await waitFor(() => expect(shownTitles()).toHaveLength(40));
      expect(loadMoreMock).toHaveBeenCalledWith({
        createdAt: "2026-09-11T23:40:00+00:00",
        id: page1[19].id,
      });
      expect(shownTitles()[0]).toBe("\u201cStory 0\u201d");
      expect(shownTitles()[39]).toBe("\u201cStory 39\u201d");
      expect(status).toHaveTextContent("Loaded 20 more notifications");
      expect(
        await screen.findByRole("button", { name: "See more" }),
      ).toBeInTheDocument();
    });

    it("drops the button at the end of the inbox, and keeps focus in the list", async () => {
      loadMoreMock.mockResolvedValue({ rows: range(20, 25), nextCursor: null });
      render(
        <NotificationsList
          initialPage={{ rows: page1, nextCursor: cursorAfter(page1[19]) }}
          unreadCount={0}
          now={NOW}
        />,
      );
      const button = screen.getByRole("button", { name: "See more" });
      button.focus();
      fireEvent.click(button);

      await waitFor(() =>
        expect(
          screen.queryByRole("button", { name: /See more|Loading/ }),
        ).not.toBeInTheDocument(),
      );
      expect(shownTitles()).toHaveLength(25);
      expect(screen.getByRole("status")).toHaveTextContent(
        "Loaded 5 more notifications",
      );
      // The button the keyboard user pressed is gone; focus lands on the
      // first row it revealed rather than falling back to <body>.
      await waitFor(() =>
        expect(document.activeElement?.closest("li")?.textContent).toContain(
          "Story 20",
        ),
      );
    });

    it("shows no button when page one is the whole inbox", () => {
      render(
        <NotificationsList
          initialPage={onePage(rows)}
          unreadCount={1}
          now={NOW}
        />,
      );
      expect(
        screen.queryByRole("button", { name: "See more" }),
      ).not.toBeInTheDocument();
    });

    it("says so when a page fails, and keeps the button to try again", async () => {
      loadMoreMock.mockResolvedValue({ error: "boom" });
      render(
        <NotificationsList
          initialPage={{ rows: page1, nextCursor: cursorAfter(page1[19]) }}
          unreadCount={0}
          now={NOW}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "See more" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Couldn't load more notifications. Try again.",
      );
      expect(shownTitles()).toHaveLength(20);
      expect(
        screen.getByRole("button", { name: "See more" }),
      ).toBeInTheDocument();
    });

    it("counts unread across the whole inbox, and mark-all clears loaded older pages too", async () => {
      loadMoreMock.mockResolvedValue({
        rows: range(20, 23, true),
        nextCursor: null,
      });
      markReadMock.mockResolvedValue({
        markedAt: "2026-09-12T12:00:01Z",
        markedIds: [],
      });
      render(
        <NotificationsList
          initialPage={{ rows: page1, nextCursor: cursorAfter(page1[19]) }}
          unreadCount={7}
          now={NOW}
        />,
      );
      // 7 is the server's whole-inbox count, though none of page one is unread.
      expect(screen.getByText("7 unread")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "See more" }));
      await waitFor(() => expect(shownTitles()).toHaveLength(23));
      expect(screen.getAllByText("(unread)", { exact: false })).toHaveLength(3);

      fireEvent.click(screen.getByRole("button", { name: "Mark all as read" }));
      await waitFor(() =>
        expect(
          screen.queryAllByText("(unread)", { exact: false }),
        ).toHaveLength(0),
      );
    });

    it("keeps loaded pages, and the row pushed off page one, when page one is refreshed", async () => {
      loadMoreMock.mockResolvedValue({ rows: range(20, 25), nextCursor: null });
      const { rerender } = render(
        <NotificationsList
          initialPage={{ rows: page1, nextCursor: cursorAfter(page1[19]) }}
          unreadCount={0}
          now={NOW}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "See more" }));
      await waitFor(() => expect(shownTitles()).toHaveLength(25));

      // A revalidation after a new notification: page one gains a row on
      // top and loses Story 19 off the bottom.
      const fresh: NotificationRow = {
        ...row(0),
        id: "00000000-0000-4000-8000-999999999999",
        story_title: "Story 99",
        created_at: "2026-09-12T11:00:00+00:00",
      };
      rerender(
        <NotificationsList
          initialPage={{
            rows: [fresh, ...page1.slice(0, 19)],
            nextCursor: cursorAfter(page1[18]),
          }}
          unreadCount={0}
          now={NOW}
        />,
      );

      expect(shownTitles()).toHaveLength(26);
      expect(shownTitles()[0]).toBe("\u201cStory 99\u201d");
      expect(shownTitles()).toContain("\u201cStory 19\u201d");
      expect(new Set(shownTitles()).size).toBe(26);
      // Older pages were already loaded to the end, so no button comes back.
      expect(
        screen.queryByRole("button", { name: "See more" }),
      ).not.toBeInTheDocument();
    });
  });
});
