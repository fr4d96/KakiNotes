import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const { submitMock } = vi.hoisted(() => ({ submitMock: vi.fn() }));
vi.mock("./actions", () => ({ submitAffirmationNoteAction: submitMock }));

import { NoteForm } from "./note-form";

const token = "0123456789abcdef".repeat(4);

beforeEach(() => {
  submitMock.mockReset();
});

describe("NoteForm", () => {
  it("labels both fields and starts with a 0 / 1000 count", () => {
    render(<NoteForm token={token} />);

    expect(screen.getByLabelText("Your note")).toBeRequired();
    expect(screen.getByLabelText("Your name (optional)")).not.toBeRequired();
    expect(screen.getByText("0 / 1000")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send note" })).toBeEnabled();
  });

  it("updates the character count live and caps the field length", () => {
    render(<NoteForm token={token} />);
    const note = screen.getByLabelText("Your note");

    fireEvent.change(note, { target: { value: "You can do it" } });

    expect(screen.getByText("13 / 1000")).toBeInTheDocument();
    expect(note).toHaveAttribute("maxlength", "1000");
    expect(screen.getByLabelText("Your name (optional)")).toHaveAttribute(
      "maxlength",
      "60",
    );
  });

  it("carries the token as a hidden field and hides the honeypot from people", () => {
    const { container } = render(<NoteForm token={token} />);

    expect(container.querySelector('input[name="token"]')).toHaveValue(token);

    const honeypot = container.querySelector('input[name="website"]');
    expect(honeypot).not.toBeNull();
    expect(honeypot).toHaveValue("");
    expect(honeypot).toHaveAttribute("tabindex", "-1");
    expect(honeypot?.closest('[aria-hidden="true"]')).not.toBeNull();
    // Not reachable by role: it is out of the accessibility tree.
    expect(
      screen.queryByRole("textbox", { name: /leave this field empty/i }),
    ).toBeNull();
  });

  it("submits the form's values to the server action", async () => {
    submitMock.mockResolvedValue({ sent: true });
    render(<NoteForm token={token} />);

    fireEvent.change(screen.getByLabelText("Your note"), {
      target: { value: "Proud of you" },
    });
    fireEvent.change(screen.getByLabelText("Your name (optional)"), {
      target: { value: "Mei" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send note" }));

    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(1));
    const formData = submitMock.mock.calls[0][1] as FormData;
    expect(formData.get("token")).toBe(token);
    expect(formData.get("body")).toBe("Proud of you");
    expect(formData.get("authorName")).toBe("Mei");
    expect(formData.get("website")).toBe("");
  });

  it("shows a thank-you state once sent", async () => {
    submitMock.mockResolvedValue({ sent: true });
    render(<NoteForm token={token} />);

    fireEvent.change(screen.getByLabelText("Your note"), {
      target: { value: "Hello" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send note" }));

    expect(await screen.findByText("Thank you")).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByLabelText("Your note")).toBeNull();
  });

  it("shows an error in an alert and keeps the typed note", async () => {
    submitMock.mockResolvedValue({ error: "We couldn't send your note." });
    render(<NoteForm token={token} />);

    fireEvent.change(screen.getByLabelText("Your note"), {
      target: { value: "Keep me" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send note" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't send your note.",
    );
    expect(screen.getByLabelText("Your note")).toHaveValue("Keep me");
  });
});
