import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const browserSession = vi.hoisted(() => ({
  signedIn: false,
  onAuth: null as
    ((event: string, session: { user: { id: string } } | null) => void) | null,
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({
        data: {
          session: browserSession.signedIn ? { user: { id: "u-1" } } : null,
        },
      }),
      onAuthStateChange: (
        callback: (
          event: string,
          session: { user: { id: string } } | null,
        ) => void,
      ) => {
        browserSession.onAuth = callback;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
    },
  }),
}));

import { ShareStoryLink } from "./share-story-link";
import { SignedOutOnly } from "./signed-out-only";
import { resetViewerIdentityForTests } from "@/lib/auth/viewer-identity";

beforeEach(() => {
  // useSignedIn reads the tab-wide viewer store; each test is a fresh tab.
  resetViewerIdentityForTests();
});

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
    render(<SignedOutOnly>Join us</SignedOutOnly>);
    expect(screen.getByText("Join us")).toBeInTheDocument();

    // Signing in reaches the page as an auth event (the shared viewer
    // store does not re-ask for the session on every remount).
    await waitFor(() => expect(browserSession.onAuth).not.toBeNull());
    browserSession.onAuth?.("SIGNED_IN", { user: { id: "u-1" } });
    await waitFor(() => expect(screen.queryByText("Join us")).toBeNull());
  });
});
