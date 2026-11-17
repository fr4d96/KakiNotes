import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const browserSession = vi.hoisted(() => ({ signedIn: false }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({
        data: {
          session: browserSession.signedIn ? { user: { id: "u-1" } } : null,
        },
      }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
    },
  }),
}));

import { ShareStoryLink } from "./share-story-link";
import { SignedOutOnly } from "./signed-out-only";

afterEach(() => {
  browserSession.signedIn = false;
});

describe("ShareStoryLink", () => {
  it("sends a visitor to sign-up", () => {
    render(
      <ShareStoryLink newStoryHref="/stories/new?country=china">
        Share your story
      </ShareStoryLink>,
    );
    expect(
      screen.getByRole("link", { name: "Share your story" }),
    ).toHaveAttribute("href", "/sign-up");
  });

  it("sends a signed-in contributor straight to a new story", async () => {
    browserSession.signedIn = true;
    render(
      <ShareStoryLink newStoryHref="/stories/new?country=china">
        Share your story
      </ShareStoryLink>,
    );
    await waitFor(() =>
      expect(
        screen.getByRole("link", { name: "Share your story" }),
      ).toHaveAttribute("href", "/stories/new?country=china"),
    );
  });
});

describe("SignedOutOnly", () => {
  it("shows its content to a visitor and hides it once signed in", async () => {
    const { rerender } = render(<SignedOutOnly>Join us</SignedOutOnly>);
    expect(screen.getByText("Join us")).toBeInTheDocument();

    browserSession.signedIn = true;
    rerender(<SignedOutOnly key="again">Join us</SignedOutOnly>);
    await waitFor(() => expect(screen.queryByText("Join us")).toBeNull());
  });
});
