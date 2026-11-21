import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("@/app/(contributor)/actions", () => ({
  updateOwnContributorAction: vi.fn(async () => ({})),
}));

import { IdentityFieldForm } from "@/app/(contributor)/account/identity-field-form";

const identity = {
  displayName: "KakiKu",
  attributionType: "display_name",
  publicProfileEnabled: true,
  publicSlug: "kakiku",
  bio: "Hello\nthere",
  homeCountryCode: "MY",
};

function posted(field: Parameters<typeof IdentityFieldForm>[0]["field"]) {
  const { container } = render(
    <IdentityFieldForm field={field} identity={identity} onDone={() => {}} />,
  );
  const form = container.querySelector("form")!;
  return Object.fromEntries(new FormData(form).entries());
}

describe("IdentityFieldForm", () => {
  it("posts the whole identity, so saving one field never clears another", () => {
    expect(posted("bio")).toEqual({
      displayName: "KakiKu",
      attributionType: "display_name",
      bio: "Hello\nthere",
      homeCountryCode: "MY",
      publicSlug: "kakiku",
    });
  });

  it("takes the edited field from its own control, not a hidden copy", () => {
    const { container } = render(
      <IdentityFieldForm field="name" identity={identity} onDone={() => {}} />,
    );
    const named = container.querySelectorAll('[name="displayName"]');
    expect(named).toHaveLength(1);
    expect(named[0]).toHaveAttribute("type", "text");
  });

  it("never posts a listing choice: the server derives it", () => {
    expect(posted("slug")).not.toHaveProperty("publicProfileEnabled");
  });

  it("carries an existing credit choice over unchanged", () => {
    const { container } = render(
      <IdentityFieldForm
        field="bio"
        identity={{ ...identity, attributionType: "anonymous" }}
        onDone={() => {}}
      />,
    );
    const data = new FormData(container.querySelector("form")!);
    expect(data.get("attributionType")).toBe("anonymous");
  });
});
