import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CountryToggle } from "./country-toggle";

describe("CountryToggle", () => {
  it("renders both countries as real links, keyboard-navigable", () => {
    render(<CountryToggle current="new-zealand" />);

    const nz = screen.getByRole("link", { name: "New Zealand" });
    const china = screen.getByRole("link", { name: "China" });
    expect(nz).toHaveAttribute("href", "/");
    expect(china).toHaveAttribute("href", "/cn");
  });

  it("marks the current country with aria-current, the other unmarked", () => {
    render(<CountryToggle current="new-zealand" />);

    expect(screen.getByRole("link", { name: "New Zealand" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "China" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("flips which country is marked current when on the China section", () => {
    render(<CountryToggle current="china" />);

    expect(screen.getByRole("link", { name: "China" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByRole("link", { name: "New Zealand" }),
    ).not.toHaveAttribute("aria-current");
  });

  it("is a labelled nav landmark for assistive technology", () => {
    render(<CountryToggle current="new-zealand" />);
    expect(
      screen.getByRole("navigation", { name: "Choose a country section" }),
    ).toBeInTheDocument();
  });
});
