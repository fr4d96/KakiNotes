import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type {
  AffirmationLink,
  AffirmationNote,
} from "@/lib/affirmations/types";

const actions = vi.hoisted(() => ({
  create: vi.fn(),
  rename: vi.fn(),
  setActive: vi.fn(),
  deleteLink: vi.fn(),
  deleteNote: vi.fn(),
}));
vi.mock("./actions", () => ({
  createAffirmationLinkAction: actions.create,
  renameAffirmationLinkAction: actions.rename,
  setAffirmationLinkActiveAction: actions.setActive,
  deleteAffirmationLinkAction: actions.deleteLink,
  deleteAffirmationNoteAction: actions.deleteNote,
}));

import { AffirmationsView } from "./affirmations-view";

const NOW = "2026-10-31T12:00:00Z";
const TOKEN = "ab".repeat(32);

const link: AffirmationLink = {
  id: "link-1",
  token: TOKEN,
  label: "Family chat",
  is_active: true,
  created_at: "2026-10-30T12:00:00Z",
  note_count: 2,
};

const notes: AffirmationNote[] = [
  {
    id: "note-1",
    body: "So proud of you.\nKeep going.",
    author_name: "Mei",
    created_at: "2026-10-31T11:00:00Z",
    link_id: "link-1",
    link_label: "Family chat",
  },
  {
    id: "note-2",
    body: "<script>alert(1)</script>",
    author_name: null,
    created_at: "2026-10-29T11:00:00Z",
    link_id: "link-1",
    link_label: null,
  },
];

beforeEach(() => {
  Object.values(actions).forEach((fn) => fn.mockReset());
  actions.create.mockResolvedValue({});
  actions.rename.mockResolvedValue({});
  actions.setActive.mockResolvedValue({ ok: true });
  actions.deleteLink.mockResolvedValue({ ok: true });
  actions.deleteNote.mockResolvedValue({ ok: true });
});

function renderView(
  overrides: Partial<{
    links: AffirmationLink[];
    notes: AffirmationNote[];
  }> = {},
) {
  return render(
    <AffirmationsView
      links={overrides.links ?? [link]}
      notes={overrides.notes ?? notes}
      siteUrl="https://kakinotes.example/"
      now={NOW}
    />,
  );
}

describe("AffirmationsView", () => {
  it("shows empty states for no links and no notes", () => {
    renderView({ links: [], notes: [] });
    expect(screen.getByText(/No links yet/)).toBeInTheDocument();
    expect(screen.getByText(/No notes yet/)).toBeInTheDocument();
  });

  it("shows each link with its full address, status and note count", () => {
    renderView();
    const field = screen.getByLabelText("Address of Family chat");
    expect(field).toHaveValue(`https://kakinotes.example/notes/${TOKEN}`);
    expect(field).toHaveAttribute("readonly");
    expect(screen.getByText(/^2 notes · Accepting notes$/)).toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: "Accept notes on Family chat" }),
    ).toBeChecked();
  });

  it("copies the link and says so", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    renderView();

    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        `https://kakinotes.example/notes/${TOKEN}`,
      ),
    );
    expect(
      await screen.findByRole("button", { name: "Copied" }),
    ).toBeInTheDocument();
  });

  it("offers Share only where the browser has a share sheet", () => {
    renderView();
    expect(screen.queryByRole("button", { name: "Share" })).toBeNull();
  });

  it("offers Share and passes the link to navigator.share when available", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", {
      value: share,
      configurable: true,
    });
    try {
      renderView();
      fireEvent.click(screen.getByRole("button", { name: "Share" }));
      await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
      expect(share.mock.calls[0][0].url).toBe(
        `https://kakinotes.example/notes/${TOKEN}`,
      );
    } finally {
      // @ts-expect-error -- removing the test-only property again
      delete navigator.share;
    }
  });

  it("switches a link off", async () => {
    renderView();
    fireEvent.click(
      screen.getByRole("switch", { name: "Accept notes on Family chat" }),
    );
    await waitFor(() =>
      expect(actions.setActive).toHaveBeenCalledWith("link-1", false),
    );
  });

  it("renames a link through the form", async () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    const input = screen.getByDisplayValue("Family chat");
    fireEvent.change(input, { target: { value: "Flatmates" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(actions.rename).toHaveBeenCalledTimes(1));
    const formData = actions.rename.mock.calls[0][1] as FormData;
    expect(formData.get("linkId")).toBe("link-1");
    expect(formData.get("label")).toBe("Flatmates");
  });

  it("asks before deleting a link, and only deletes on confirm", async () => {
    renderView();
    const linkSection = screen.getByRole("region", { name: "Your links" });
    fireEvent.click(
      within(linkSection).getAllByRole("button", { name: "Delete" })[0],
    );
    expect(actions.deleteLink).not.toHaveBeenCalled();

    const dialog = await screen.findByRole("dialog", {
      name: "Delete this link?",
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(actions.deleteLink).toHaveBeenCalledWith("link-1"),
    );
  });

  it("lists notes with name or Anonymous, the link, and keeps line breaks as text", () => {
    renderView();
    const first = screen.getByText(/So proud of you/);
    expect(first).toHaveClass("whitespace-pre-wrap");
    expect(first.textContent).toBe("So proud of you.\nKeep going.");
    expect(screen.getByText("Mei")).toBeInTheDocument();
    expect(screen.getByText("Anonymous")).toBeInTheDocument();
    expect(screen.getByText(/via Family chat/)).toBeInTheDocument();
  });

  it("renders note markup as inert text, never as HTML", () => {
    const { container } = renderView();
    expect(screen.getByText("<script>alert(1)</script>")).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
  });

  it("deletes a note only after confirmation", async () => {
    renderView();
    const [firstNoteDelete] = screen
      .getAllByRole("button", { name: "Delete" })
      .filter((button) => button.closest("article"));
    fireEvent.click(firstNoteDelete);

    const dialog = await screen.findByRole("dialog", {
      name: "Delete this note?",
    });
    expect(actions.deleteNote).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(actions.deleteNote).toHaveBeenCalledWith("note-1"),
    );
  });
});
