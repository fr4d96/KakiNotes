import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { submitMock, pathname } = vi.hoisted(() => ({
  submitMock: vi.fn(),
  pathname: { current: "/stories/abc" },
}));
vi.mock("@/lib/bug-reports/submit-action", () => ({
  submitBugReportAction: submitMock,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => pathname.current,
}));

import { BugReportButton } from "./bug-report-dialog";
import { notePathname } from "@/lib/navigation/in-app-history";

beforeEach(() => {
  submitMock.mockReset();
  pathname.current = "/stories/abc";
});

function openDialog() {
  render(<BugReportButton />);
  fireEvent.click(screen.getByRole("button", { name: "Report a bug" }));
  return screen.getByRole("dialog", { hidden: true });
}

describe("BugReportButton", () => {
  it("opens a labelled modal dialog with a labelled, capped textarea", () => {
    const dialog = openDialog();

    expect(dialog).toHaveAttribute("open");
    expect(dialog).toHaveAccessibleName("Report a bug");
    const field = screen.getByLabelText("What happened?");
    expect(field).toBeRequired();
    expect(field).toHaveAttribute("maxlength", "2000");
    expect(field).toHaveAttribute("minlength", "10");
    expect(screen.getByText("0 of 2000 characters")).toBeInTheDocument();
  });

  it("counts characters live", () => {
    openDialog();
    fireEvent.change(screen.getByLabelText("What happened?"), {
      target: { value: "Broken link" },
    });
    expect(screen.getByText("11 of 2000 characters")).toBeInTheDocument();
  });

  it("closes on Escape (the dialog's cancel event) and on Cancel", () => {
    const dialog = openDialog();
    // Escape: the browser fires `cancel`, then closes the dialog (`close`).
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    fireEvent(dialog, new Event("close"));
    expect(dialog).not.toHaveAttribute("open");

    fireEvent.click(screen.getByRole("button", { name: "Report a bug" }));
    expect(dialog).toHaveAttribute("open");
    fireEvent.click(
      screen.getByRole("button", { name: "Cancel", hidden: true }),
    );
    expect(dialog).not.toHaveAttribute("open");
  });

  it("sends the current page as a hidden field", () => {
    const dialog = openDialog();
    const hidden = dialog.querySelector('input[name="pagePath"]');
    expect(hidden).toHaveValue("/stories/abc");
  });

  it("reports the previous page when opened from Settings", () => {
    notePathname("/my-photos");
    notePathname("/settings");
    pathname.current = "/settings";
    const dialog = openDialog();
    expect(dialog.querySelector('input[name="pagePath"]')).toHaveValue(
      "/my-photos",
    );
  });

  it("reports the previous page when opened from the signed-in You page", () => {
    notePathname("/stories/xyz");
    notePathname("/account");
    pathname.current = "/account";
    const dialog = openDialog();
    expect(dialog.querySelector('input[name="pagePath"]')).toHaveValue(
      "/stories/xyz",
    );
  });

  it("hides the honeypot from people and assistive tech", () => {
    const dialog = openDialog();
    const honeypot = dialog.querySelector('input[name="website"]');
    expect(honeypot).toHaveAttribute("tabindex", "-1");
    expect(honeypot?.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it("shows the success state after a sent report", async () => {
    submitMock.mockResolvedValue({ sent: true });
    openDialog();
    fireEvent.change(screen.getByLabelText("What happened?"), {
      target: { value: "The save button does nothing." },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Send report", hidden: true }),
    );

    expect(
      await screen.findByRole("status", { hidden: true }),
    ).toHaveTextContent("Thanks, report sent");
  });

  it("shows the server's error and marks the field invalid", async () => {
    submitMock.mockResolvedValue({ error: "We couldn't send your report." });
    openDialog();
    fireEvent.change(screen.getByLabelText("What happened?"), {
      target: { value: "The save button does nothing." },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Send report", hidden: true }),
    );

    expect(
      await screen.findByRole("alert", { hidden: true }),
    ).toHaveTextContent("We couldn't send your report.");
    await waitFor(() =>
      expect(screen.getByLabelText("What happened?")).toHaveAttribute(
        "aria-invalid",
        "true",
      ),
    );
  });

  it("starts fresh each time it opens", async () => {
    submitMock.mockResolvedValue({ sent: true });
    openDialog();
    fireEvent.change(screen.getByLabelText("What happened?"), {
      target: { value: "The save button does nothing." },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Send report", hidden: true }),
    );
    await screen.findByRole("status", { hidden: true });

    fireEvent.click(
      screen.getByRole("button", { name: "Close", hidden: true }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Report a bug" }));
    expect(screen.getByLabelText("What happened?")).toHaveValue("");
  });
});
