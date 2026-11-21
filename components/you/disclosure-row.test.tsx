import { afterEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { DisclosureRow, YouGroup } from "@/components/you/disclosure-row";

function Row({ id = "bio" }: { id?: string }) {
  return (
    <YouGroup heading="On your public page">
      <DisclosureRow id={id} label="Bio" value="Not set" valueMuted>
        {(close) => (
          <div>
            <p>Editor</p>
            <button type="button" onClick={close}>
              Cancel
            </button>
          </div>
        )}
      </DisclosureRow>
    </YouGroup>
  );
}

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("DisclosureRow", () => {
  it("shows the label and current value, closed", () => {
    render(<Row />);
    const button = screen.getByRole("button", { name: /Bio/ });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveTextContent("Not set");
    expect(screen.queryByText("Editor")).not.toBeInTheDocument();
  });

  it("opens in place on tap and closes again from the editor", () => {
    render(<Row />);
    const button = screen.getByRole("button", { name: /Bio/ });
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Editor")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveFocus();
  });

  it("opens when the URL hash names it, including an alias", () => {
    window.history.replaceState(null, "", "/account#contributor-identity");
    render(<Row id="name contributor-identity" />);
    expect(screen.getByRole("button", { name: /Bio/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("follows in-page hash links", () => {
    render(<Row />);
    act(() => {
      window.history.replaceState(null, "", "/account#bio");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(screen.getByText("Editor")).toBeInTheDocument();
  });

  it("keeps a closed editor out of the tab order", () => {
    render(<Row />);
    expect(
      screen.getByRole("region", { name: "Bio", hidden: true }),
    ).toHaveAttribute("inert");
  });
});
