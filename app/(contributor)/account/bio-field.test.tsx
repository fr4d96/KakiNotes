import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { BioField } from "@/app/(contributor)/account/bio-field";
import { BIO_MAX_LENGTH } from "@/lib/validation/profile";

describe("BioField", () => {
  it("starts with the saved bio and counts it", () => {
    render(<BioField defaultValue="Hello" />);
    expect(screen.getByLabelText("About you")).toHaveValue("Hello");
    expect(screen.getByText(`5 / ${BIO_MAX_LENGTH}`)).toBeInTheDocument();
  });

  it("is a named form field so the Server Action reads it from FormData", () => {
    render(<BioField defaultValue="" />);
    expect(screen.getByLabelText("About you")).toHaveAttribute("name", "bio");
  });

  it("updates the count live as the user types, line breaks counting once", () => {
    render(<BioField defaultValue="" />);
    fireEvent.change(screen.getByLabelText("About you"), {
      target: { value: "ab\ncd" },
    });
    expect(screen.getByText(`5 / ${BIO_MAX_LENGTH}`)).toBeInTheDocument();
  });

  it("flags a bio over the limit instead of cutting it off", () => {
    render(<BioField defaultValue={"a".repeat(BIO_MAX_LENGTH + 4)} />);
    const textarea = screen.getByLabelText("About you");
    expect(textarea).not.toHaveAttribute("maxlength");
    expect(textarea).toHaveAttribute("aria-invalid", "true");
    expect(
      screen.getByText(`${BIO_MAX_LENGTH + 4} / ${BIO_MAX_LENGTH}`),
    ).toHaveClass("text-destructive");
  });

  it("is not flagged at exactly the limit", () => {
    render(<BioField defaultValue={"a".repeat(BIO_MAX_LENGTH)} />);
    expect(screen.getByLabelText("About you")).not.toHaveAttribute(
      "aria-invalid",
    );
  });
});
