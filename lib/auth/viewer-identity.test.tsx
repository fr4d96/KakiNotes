import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type AuthCallback = (
  event: string,
  session: { user: { id: string } } | null,
) => void;

const { client } = vi.hoisted(() => ({
  client: {
    session: null as { user: { id: string } } | null,
    sessionError: null as unknown,
    rows: {} as Record<string, unknown>,
    authCallback: null as AuthCallback | null,
    reads: [] as string[],
  },
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: () =>
        Promise.resolve({
          data: { session: client.session },
          error: client.sessionError,
        }),
      onAuthStateChange: (callback: AuthCallback) => {
        client.authCallback = callback;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => {
            client.reads.push(table);
            return Promise.resolve({ data: client.rows[table] ?? null });
          },
        }),
      }),
    }),
  }),
}));

import {
  ViewerIdentitySeed,
  resetViewerIdentityForTests,
  useViewerIdentity,
} from "./viewer-identity";

function Probe() {
  const viewer = useViewerIdentity();
  return (
    <p data-testid="viewer">
      {viewer.status}|{viewer.avatarEmoji ?? "none"}|{viewer.role ?? "none"}
    </p>
  );
}

const viewer = () => screen.getByTestId("viewer").textContent;

beforeEach(() => {
  resetViewerIdentityForTests();
  client.session = null;
  client.sessionError = null;
  client.rows = {};
  client.authCallback = null;
  client.reads = [];
});

describe("viewer identity", () => {
  it("reads the avatar the way the server does: the contributor's first", async () => {
    client.session = { user: { id: "u1" } };
    client.rows = {
      contributors: { avatar_emoji: "🥝" },
      profiles: { avatar_emoji: "🐑" },
      user_roles: { role: "moderator" },
    };
    render(<Probe />);
    await vi.waitFor(() => expect(viewer()).toBe("signed-in|🥝|moderator"));
  });

  it("falls back to the profile's avatar when the identity has none", async () => {
    client.session = { user: { id: "u1" } };
    client.rows = {
      contributors: { avatar_emoji: null },
      profiles: { avatar_emoji: "🐑" },
    };
    render(<Probe />);
    await vi.waitFor(() => expect(viewer()).toBe("signed-in|🐑|none"));
  });

  // The 2026-11-18 bug: tapping Home swapped the contributor header for a
  // freshly mounted public one, which started from "signed out".
  it("keeps the avatar across a header remount, with no signed-out frame", async () => {
    client.session = { user: { id: "u1" } };
    client.rows = { contributors: { avatar_emoji: "🥝" } };
    const first = render(<Probe />);
    await vi.waitFor(() => expect(viewer()).toBe("signed-in|🥝|none"));
    first.unmount();

    render(<Probe />);
    expect(viewer()).toBe("signed-in|🥝|none");
  });

  it("starts signed in from a server-rendered header's seed, without re-reading", async () => {
    client.session = { user: { id: "u1" } };
    const contributorArea = render(
      <ViewerIdentitySeed avatarEmoji="🐧" role={null} />,
    );
    contributorArea.unmount();

    render(<Probe />);
    expect(viewer()).toBe("signed-in|🐧|none");
    await act(async () => {});
    expect(viewer()).toBe("signed-in|🐧|none");
    expect(client.reads).toEqual([]);
  });

  it("keeps what it knew when the session lookup fails", async () => {
    render(<ViewerIdentitySeed avatarEmoji="🐧" role={null} />);
    client.sessionError = new Error("offline");
    render(<Probe />);
    await act(async () => {});
    expect(viewer()).toBe("signed-in|🐧|none");
  });

  it("clears on sign-out", async () => {
    client.session = { user: { id: "u1" } };
    client.rows = { contributors: { avatar_emoji: "🥝" } };
    render(<Probe />);
    await vi.waitFor(() => expect(viewer()).toBe("signed-in|🥝|none"));

    vi.useFakeTimers();
    act(() => {
      client.authCallback?.("SIGNED_OUT", null);
      vi.runAllTimers();
    });
    vi.useRealTimers();
    expect(viewer()).toBe("signed-out|none|none");
  });
});
