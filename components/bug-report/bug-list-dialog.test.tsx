import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { openMock } = vi.hoisted(() => ({ openMock: vi.fn() }));
vi.mock("@/lib/bug-reports/list-action", () => ({
  openBugListAction: openMock,
}));

import { BugListButton } from "./bug-list-dialog";

const reports = [
  {
    id: "6f1c2b8e-1a2b-4c3d-8e9f-0a1b2c3d4e5f",
    description: "Save does nothing",
    pagePath: "/my-stories",
    status: "open",
    createdAt: "2026-11-28T02:00:00Z",
  },
  {
    id: "7a1c2b8e-1a2b-4c3d-8e9f-0a1b2c3d4e5f",
    description: "Photo spins forever",
    pagePath: null,
    status: "fixed",
    createdAt: "2026-11-27T02:00:00Z",
  },
];

beforeEach(() => openMock.mockReset());

function openDialog() {
  render(<BugListButton />);
  fireEvent.click(screen.getByRole("button", { name: "Bug Lists" }));
  return screen.getByRole("dialog", { hidden: true });
}

function unlock(password = "test-password") {
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: password },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Show bugs", hidden: true }),
  );
}

describe("BugListButton", () => {
  it("asks for a password in a labelled modal dialog", () => {
    const dialog = openDialog();
    expect(dialog).toHaveAttribute("open");
    expect(dialog).toHaveAccessibleName("Bug Lists");
    const field = screen.getByLabelText("Password");
    expect(field).toHaveAttribute("type", "password");
    expect(field).toBeRequired();
    expect(screen.queryByText("Save does nothing")).not.toBeInTheDocument();
  });

  it("shows the list with fixed / not fixed and a Fix link for unfixed bugs", async () => {
    openMock.mockResolvedValue({ ok: true, reports });
    openDialog();
    unlock();

    expect(await screen.findByText("Save does nothing")).toBeInTheDocument();
    expect(openMock).toHaveBeenCalledWith("test-password");
    expect(
      screen.getByText("2 bugs reported, newest first."),
    ).toBeInTheDocument();
    expect(screen.getByText("Not fixed")).toBeInTheDocument();
    expect(screen.getAllByText("Fixed").length).toBeGreaterThan(0);

    const links = screen.getAllByRole("link", {
      name: "Fix with Claude",
      hidden: true,
    });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("target", "_blank");
    expect(links[0].getAttribute("href")).toMatch(
      /^https:\/\/claude\.ai\/code\?/,
    );
    expect(links[0].getAttribute("rel")).toContain("noopener");
  });

  it("shows the server's error for a wrong password and keeps the list hidden", async () => {
    openMock.mockResolvedValue({
      ok: false,
      error: "That password isn't right.",
    });
    openDialog();
    unlock("nope");

    expect(
      await screen.findByRole("alert", { hidden: true }),
    ).toHaveTextContent("That password isn't right.");
    expect(screen.queryByText("Save does nothing")).not.toBeInTheDocument();
  });

  it("forgets the list when closed and asks again on reopen", async () => {
    openMock.mockResolvedValue({ ok: true, reports });
    const dialog = openDialog();
    unlock();
    await screen.findByText("Save does nothing");

    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    fireEvent(dialog, new Event("close"));
    fireEvent.click(screen.getByRole("button", { name: "Bug Lists" }));

    expect(screen.queryByText("Save does nothing")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toHaveValue("");
  });
});
