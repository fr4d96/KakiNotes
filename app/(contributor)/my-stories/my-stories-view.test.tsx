import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MyStoriesView } from "./my-stories-view";
import { ToastProvider } from "@/components/ui/toast";
import { mintPreviewUrlAction } from "@/app/(contributor)/stories/[id]/media-actions";
import type { MyStoryWithCover } from "@/lib/story/contributor-queries";

// The thumbnail mints a short-lived signed preview URL through a Server
// Action; in a jsdom unit test there is no server, so the action is stubbed
// and only the component's own rendering is under test here.
vi.mock("@/app/(contributor)/stories/[id]/media-actions", () => ({
  mintPreviewUrlAction: vi.fn(async () => ({ url: "blob:signed-preview" })),
  // The batched minting MyStoryPhotos uses (via lib/story/preview-url-client).
  mintPreviewUrlsAction: vi.fn(async (ids: string[]) =>
    Object.fromEntries(ids.map((id) => [id, { url: `blob:signed-${id}` }])),
  ),
}));

// deleteDraftStoryAction ultimately imports lib/story/mutations.ts, which is
// marked "server-only" -- unimportable from this Client Component test the
// same way the thumbnail action above is, so it's stubbed rather than left
// to transitively pull in a real server module.
vi.mock("./actions", () => ({
  deleteDraftStoryAction: vi.fn(async () => ({ ok: true }) as const),
  requestStoryTakedownAction: vi.fn(async () => ({ ok: true }) as const),
  cancelStoryTakedownAction: vi.fn(async () => ({ ok: true }) as const),
}));

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: (href: string) => push(href) }),
}));

// StartRevisionButton calls into the story lifecycle actions, which import
// "server-only" modules -- stubbed for the same reason as ./actions above.
vi.mock("@/app/(contributor)/stories/[id]/preview/actions", () => ({
  startStoryRevisionAction: vi.fn(
    async () =>
      ({
        ok: true,
        revisionId: "66666666-6666-4666-8666-666666666666",
      }) as const,
  ),
}));

// list_my_stories()'s generated row type declares the revision-pointer
// columns non-null (Supabase's generator can't read nullability through a
// RETURNS TABLE), but they really are null for a story with nothing in
// flight -- which is precisely the state several of these tests set up.
type StoryOverrides = Partial<
  Omit<MyStoryWithCover, "current_draft_revision_id" | "published_revision_id">
> & {
  current_draft_revision_id?: string | null;
  published_revision_id?: string | null;
};

function makeStory(overrides: StoryOverrides = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Picking apples in Hawke's Bay",
    excerpt: "Six weeks on an orchard.",
    lifecycle_status: "draft",
    current_draft_revision_id: "22222222-2222-4222-8222-222222222222",
    published_revision_id: null,
    version: 1,
    updated_at: "2026-08-01T00:00:00.000Z",
    regions: [],
    draftRevisionStatus: "draft",
    coverMediaId: "33333333-3333-4333-8333-333333333333",
    coverAltText: "An orchard at dawn",
    mediaIds: ["33333333-3333-4333-8333-333333333333"],
    // Matches delete_draft_story()'s own "exactly one revision, ever" rule
    // (supabase/migrations/20260926110804_list_my_stories_revision_count.sql)
    // -- 1 is the ordinary, never-submitted-before draft every existing test
    // here assumes unless it says otherwise.
    revisionCount: 1,
    ...overrides,
  } as MyStoryWithCover;
}

// The per-story actions beyond the one primary pill live in a "..." menu:
// open the one belonging to `title` and hand back the menu element.
async function openMenu(
  user: ReturnType<typeof userEvent.setup>,
  title = "Picking apples in Hawke's Bay",
) {
  await user.click(
    screen.getByRole("button", { name: `More actions for ${title}` }),
  );
  return screen.getByRole("menu", { name: `Actions for ${title}` });
}

// This test environment provides no localStorage, so stub a minimal
// in-memory one -- the view reads it synchronously through
// useSyncExternalStore and the "no stored preference" default is exactly
// what's under test.
let store: Record<string, string> = {};

beforeEach(() => {
  push.mockClear();
  // jsdom implements no layout, so Element.prototype.scrollIntoView does not
  // exist -- goToPage() calls it when the page changes.
  Element.prototype.scrollIntoView = vi.fn();
  store = {};
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  });
});

describe("MyStoriesView", () => {
  it("links to story folders from md up, leaving phones to the bottom tab bar", () => {
    render(<MyStoriesView stories={[makeStory()]} />);

    const folders = screen.getByRole("link", { name: "Open story folders" });
    expect(folders).toHaveAttribute("href", "/my-stories/map");
    // Phones have a Folders tab in the bottom bar (components/bottom-tab-bar.tsx),
    // so the toolbar icon is hidden there; from md up there is no tab bar and
    // this link is the one way in.
    expect(folders.className).toContain("max-md:hidden");
  });

  describe("phone layout", () => {
    it("names the page in the header on phones and moves New Story into the toolbar", () => {
      render(<MyStoriesView stories={[makeStory()]} />);
      const heading = screen.getByRole("heading", {
        level: 1,
        name: "My Stories",
      });
      // The header shows the title on a phone (components/header-brand.tsx),
      // so the page's own <h1> is screen-reader-only there.
      expect(heading.className).toContain("max-md:sr-only");

      const [desktopPill, phonePlus] = screen.getAllByRole("link", {
        name: "New Story",
      });
      for (const link of [desktopPill, phonePlus]) {
        expect(link).toHaveAttribute("href", "/stories/new");
      }
      // md and up: a labelled pill beside the title, hidden on phones.
      expect(desktopPill.parentElement).toBe(heading.parentElement);
      expect(desktopPill.className).toContain("max-md:hidden");
      // Phones: an accent "+" leading the toolbar, hidden from md up.
      expect(phonePlus.className).toContain("md:hidden");
      expect(phonePlus.className).toContain("bg-accent");
      expect(phonePlus.parentElement).toBe(
        screen.getByRole("link", { name: "Open story folders" }).parentElement,
      );
    });

    it("fits every secondary action into ONE non-scrolling toolbar of icons", () => {
      render(<MyStoriesView stories={[makeStory()]} />);
      const links = [
        ["Open story folders", "/my-stories/map"],
        ["My Photos", "/my-photos"],
        ["Import", "/stories/new/import"],
      ] as const;
      const toolbar = screen.getByRole("link", {
        name: "Open story folders",
      }).parentElement!;
      for (const [name, href] of links) {
        const link = screen.getByRole("link", { name });
        expect(link).toHaveAttribute("href", href);
        expect(link.parentElement).toBe(toolbar);
        // Icon-only on a phone: the name is screen-reader text (shown from
        // md up) plus a tooltip, and the drawn icon is an svg.
        expect(link.querySelector("svg")).not.toBeNull();
        expect(within(link).getByText(name)).toHaveClass("sr-only");
        expect(link).toHaveAttribute("title", name);
      }
      // Nothing in the header scrolls sideways any more.
      let node: HTMLElement | null = toolbar;
      while (node && node.tagName !== "BODY") {
        expect(node.className).not.toContain("overflow-x-auto");
        node = node.parentElement;
      }
    });

    it("keeps the compact grid/list buttons past 44px with a hit-slop", () => {
      render(<MyStoriesView stories={[makeStory()]} />);
      for (const name of ["Grid view", "List view"]) {
        const button = screen.getByRole("button", { name });
        expect(button.className).toContain("h-9");
        expect(button.className).toContain("after:-inset-1");
      }
    });

    it("slides the toggle's selected pill rather than swapping fills", async () => {
      const user = userEvent.setup();
      render(<MyStoriesView stories={[makeStory()]} />);
      const group = screen.getByRole("group", { name: "View" });
      const thumb = group.querySelector("span[aria-hidden='true']")!;
      expect(thumb.className).toContain("translate-x-full"); // list is default
      expect(thumb.className).toContain("motion-reduce:transition-none");

      await user.click(screen.getByRole("button", { name: "Grid view" }));
      expect(thumb.className).toContain("translate-x-0");
    });

    it("gives the primary action and the more button a 44px target", () => {
      render(
        <MyStoriesView stories={[makeStory({ lifecycle_status: "draft" })]} />,
      );
      const edit = screen.getByRole("link", { name: /^Edit / });
      expect(edit.className).toContain("h-11");
      expect(edit.className).toContain("press");
      const more = screen.getByRole("button", { name: /^More actions for / });
      expect(more.className).toContain("h-11");
      expect(more.className).toContain("w-11");
    });

    it("makes the whole row (and grid card) one link via the title", () => {
      const { unmount } = render(<MyStoriesView stories={[makeStory()]} />);
      const rowTitle = screen.getByRole("link", {
        name: "Picking apples in Hawke's Bay",
      });
      expect(rowTitle.className).toContain("after:inset-0");
      unmount();

      store["kaki-my-stories-view"] = "grid";
      render(<MyStoriesView stories={[makeStory()]} />);
      const cardTitle = screen.getByRole("link", {
        name: "Picking apples in Hawke's Bay",
      });
      expect(cardTitle.className).toContain("after:inset-0");
      expect(cardTitle).toHaveAttribute("href");
    });
  });

  it("defaults to list view when nothing is stored", () => {
    render(<MyStoriesView stories={[makeStory()]} />);

    expect(screen.getByRole("button", { name: "List view" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Grid view" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("honours a stored grid preference over the list default", () => {
    store["kaki-my-stories-view"] = "grid";

    render(<MyStoriesView stories={[makeStory()]} />);

    expect(screen.getByRole("button", { name: "Grid view" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("reuses the cached preview URL when switching between grid and list view, instead of re-minting it", async () => {
    // A mediaId not used by any other test in this file, and a cleared
    // call count -- the module-level preview URL cache in
    // story-cover-thumbnail.tsx is process-wide, so both must be isolated
    // from whatever earlier tests already minted/cached.
    vi.mocked(mintPreviewUrlAction).mockClear();
    const user = userEvent.setup();
    render(
      <MyStoriesView
        stories={[
          makeStory({ coverMediaId: "99999999-9999-4999-8999-999999999999" }),
        ]}
      />,
    );

    // List view passes no alt text (the title link alongside carries it
    // instead), which gives the resolved <img> an empty accessible name --
    // match on the mocked resolved URL instead of alt text or role.
    const findThumbnail = () =>
      waitFor(() => {
        const img = document.querySelector('img[src="blob:signed-preview"]');
        expect(img).toBeTruthy();
        return img as HTMLImageElement;
      });

    // Initial (list) render mints the URL once.
    await findThumbnail();
    expect(mintPreviewUrlAction).toHaveBeenCalledTimes(1);

    // Switching to grid remounts the thumbnail in a new <ul> subtree; it
    // should pick up the still-fresh cached URL rather than re-minting.
    await user.click(screen.getByRole("button", { name: "Grid view" }));
    await findThumbnail();
    expect(mintPreviewUrlAction).toHaveBeenCalledTimes(1);

    // And back to list -- still no additional mint.
    await user.click(screen.getByRole("button", { name: "List view" }));
    await findThumbnail();
    expect(mintPreviewUrlAction).toHaveBeenCalledTimes(1);
  });

  it("shows a cover thumbnail beside each title in list view", () => {
    render(
      <MyStoriesView
        stories={[
          makeStory(),
          makeStory({
            id: "44444444-4444-4444-8444-444444444444",
            title: "A vineyard season",
            coverMediaId: null,
          }),
        ]}
      />,
    );

    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    // Every row leads with a thumbnail -- a real cover once its signed URL
    // resolves, or the no-image placeholder for a story that has none --
    // and it sits before the title in document order.
    for (const row of rows) {
      const thumb = row.querySelector("a[aria-hidden='true']");
      expect(thumb).not.toBeNull();
      expect(
        thumb!.compareDocumentPosition(
          within(row).getByRole("link", { name: /^Edit / }),
        ) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
    // A plain draft's title/thumbnail links straight to editing, not preview.
    expect(
      screen.getByRole("link", { name: "Picking apples in Hawke's Bay" }),
    ).toHaveAttribute(
      "href",
      "/stories/11111111-1111-4111-8111-111111111111/edit",
    );
  });

  it("sends a non-draft story's title/thumbnail to preview, not edit", () => {
    render(
      <MyStoriesView
        stories={[makeStory({ lifecycle_status: "published" })]}
      />,
    );

    expect(
      screen.getByRole("link", { name: "Picking apples in Hawke's Bay" }),
    ).toHaveAttribute(
      "href",
      "/stories/11111111-1111-4111-8111-111111111111/preview",
    );
  });

  it("offers Edit only where an edit would actually be accepted", () => {
    render(
      <MyStoriesView
        stories={[
          makeStory({ lifecycle_status: "pending_review" }),
          makeStory({
            id: "44444444-4444-4444-8444-444444444444",
            title: "Awaiting my approval",
            lifecycle_status: "awaiting_contributor_approval",
          }),
        ]}
      />,
    );

    expect(
      screen.queryByRole("link", { name: /^Edit/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Review/ })).toBeInTheDocument();
  });

  // BUG: My Stories used to offer "Delete" on a draft that had already been
  // through review once (submitted, then rejected/withdrawn/sent back, and
  // now editable again) -- delete_draft_story() always refuses those
  // (revision_count > 1, "has prior reviewed revision history"), so
  // confirming Delete there just failed with no clue why. Fixed by gating
  // `deletable` on revisionCount === 1 too (my-stories-view.tsx), matching
  // the RPC's own rule exactly via list_my_stories()'s new revision_count
  // column (supabase/migrations/20260926110804_list_my_stories_revision_count.sql).
  it("hides Delete for a draft with prior review history, even though it looks like a plain draft otherwise", async () => {
    render(<MyStoriesView stories={[makeStory({ revisionCount: 2 })]} />);

    await openMenu(userEvent.setup());
    expect(
      screen.queryByRole("menuitem", { name: /^Delete/ }),
    ).not.toBeInTheDocument();
  });

  it("offers Delete only for a never-published draft, with a confirm step", async () => {
    const { deleteDraftStoryAction } = await import("./actions");
    const user = userEvent.setup();
    render(
      <MyStoriesView
        stories={[
          makeStory(),
          makeStory({
            id: "44444444-4444-4444-8444-444444444444",
            title: "Already published",
            lifecycle_status: "published",
            published_revision_id: "55555555-5555-4555-8555-555555555555",
          }),
        ]}
      />,
    );

    // Only the plain draft is deletable -- the published story's menu has no
    // Delete.
    await openMenu(user, "Already published");
    expect(
      screen.queryByRole("menuitem", { name: "Delete" }),
    ).not.toBeInTheDocument();
    await user.keyboard("{Escape}");

    await openMenu(user);
    const deleteButton = screen.getByRole("menuitem", { name: "Delete" });
    await user.click(deleteButton);

    expect(
      screen.getByRole("heading", { name: "Delete this story?" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      screen.queryByRole("heading", { name: "Delete this story?" }),
    ).not.toBeInTheDocument();

    await user.click(deleteButton);
    await user.click(screen.getByRole("button", { name: "Delete story" }));

    expect(deleteDraftStoryAction).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      1,
    );
  });

  describe("per-story actions menu", () => {
    const published = makeStory({
      id: "44444444-4444-4444-8444-444444444444",
      title: "Already published",
      lifecycle_status: "published",
      published_revision_id: "55555555-5555-4555-8555-555555555555",
      current_draft_revision_id: null,
      draftRevisionStatus: null,
    });

    function menuItemNames(menu: HTMLElement) {
      return within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent);
    }

    it("shows ONE labelled primary action per card and no other action buttons", () => {
      render(<MyStoriesView stories={[makeStory()]} />);
      const row = screen.getByRole("listitem");
      expect(
        within(row).getByRole("link", { name: /^Edit / }),
      ).toHaveTextContent("Edit");
      expect(
        within(row).queryByRole("button", { name: /^(Delete|Take down)/ }),
      ).not.toBeInTheDocument();
      expect(
        within(row).queryByRole("link", { name: /^Preview/ }),
      ).not.toBeInTheDocument();
    });

    it("lists Preview then Delete for an editable draft", async () => {
      const user = userEvent.setup();
      render(<MyStoriesView stories={[makeStory()]} />);
      const button = screen.getByRole("button", {
        name: "More actions for Picking apples in Hawke's Bay",
      });
      expect(button).toHaveAttribute("aria-haspopup", "menu");
      expect(button).toHaveAttribute("aria-expanded", "false");
      const menu = await openMenu(user);
      expect(button).toHaveAttribute("aria-expanded", "true");
      expect(menuItemNames(menu)).toEqual(["Preview", "Delete"]);
    });

    it("leads with Edit and keeps Take down last for a published story", async () => {
      const user = userEvent.setup();
      render(<MyStoriesView stories={[published]} />);
      expect(
        screen.getByRole("button", { name: "Edit Already published" }),
      ).toBeInTheDocument();
      const menu = await openMenu(user, "Already published");
      expect(menuItemNames(menu)).toEqual(["Preview", "Take down"]);
    });

    it("makes Review the primary action and offers no menu when nothing else applies", () => {
      render(
        <MyStoriesView
          stories={[
            makeStory({ lifecycle_status: "awaiting_contributor_approval" }),
          ]}
        />,
      );
      expect(screen.getByRole("link", { name: /^Review/ })).toHaveTextContent(
        "Review",
      );
      expect(
        screen.queryByRole("button", { name: /^More actions/ }),
      ).not.toBeInTheDocument();
    });

    it("puts Edit anyway in the menu of a story that is in review", async () => {
      const user = userEvent.setup();
      render(
        <MyStoriesView
          stories={[
            makeStory({
              lifecycle_status: "pending_review",
              draftRevisionStatus: "submitted",
            }),
          ]}
        />,
      );
      expect(screen.getByRole("link", { name: /^Preview/ })).toHaveTextContent(
        "Preview",
      );
      const menu = await openMenu(user);
      expect(menuItemNames(menu)).toEqual(["Edit anyway"]);
    });

    it("closes on Escape and returns focus to the button", async () => {
      const user = userEvent.setup();
      render(<MyStoriesView stories={[makeStory()]} />);
      const button = screen.getByRole("button", { name: /^More actions for / });
      await openMenu(user);
      await user.keyboard("{Escape}");
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
      expect(button).toHaveAttribute("aria-expanded", "false");
      expect(button).toHaveFocus();
    });

    it("closes on a click outside, and moves between items with the arrow keys", async () => {
      const user = userEvent.setup();
      render(<MyStoriesView stories={[makeStory()]} />);
      const menu = await openMenu(user);
      const [preview, del] = within(menu).getAllByRole("menuitem");
      expect(preview).toHaveFocus();
      await user.keyboard("{ArrowDown}");
      expect(del).toHaveFocus();
      await user.keyboard("{ArrowDown}");
      expect(preview).toHaveFocus();
      await user.click(document.body);
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it("keeps only one menu open at a time", async () => {
      const user = userEvent.setup();
      render(
        <MyStoriesView
          stories={[
            makeStory(),
            makeStory({
              id: "44444444-4444-4444-8444-444444444444",
              title: "Second draft",
            }),
          ]}
        />,
      );
      await openMenu(user, "Second draft");
      await openMenu(user);
      expect(screen.getAllByRole("menu")).toHaveLength(1);
      expect(
        screen.getByRole("menu", {
          name: "Actions for Picking apples in Hawke's Bay",
        }),
      ).toBeInTheDocument();
    });

    it("still asks before deleting, from inside the menu", async () => {
      const { deleteDraftStoryAction } = await import("./actions");
      vi.mocked(deleteDraftStoryAction).mockClear();
      const user = userEvent.setup();
      render(<MyStoriesView stories={[makeStory()]} />);
      await openMenu(user);
      await user.click(screen.getByRole("menuitem", { name: "Delete" }));
      expect(deleteDraftStoryAction).not.toHaveBeenCalled();
      expect(
        screen.getByRole("heading", { name: "Delete this story?" }),
      ).toBeInTheDocument();
    });

    it("opens the actions in a bottom sheet on a phone", async () => {
      Object.defineProperty(window, "matchMedia", {
        configurable: true,
        value: (query: string) => ({
          matches: true,
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
        }),
      });
      try {
        const user = userEvent.setup();
        render(<MyStoriesView stories={[makeStory()]} />);
        await user.click(
          screen.getByRole("button", { name: /^More actions for / }),
        );
        const sheet = screen.getByRole("dialog", {
          name: "Actions for Picking apples in Hawke's Bay",
        });
        expect(
          within(sheet).getByRole("menuitem", { name: "Delete" }),
        ).toBeInTheDocument();
      } finally {
        // @ts-expect-error -- jsdom has no matchMedia by default
        delete window.matchMedia;
      }
    });
  });

  describe("taking a published story down", () => {
    const published = makeStory({
      id: "44444444-4444-4444-8444-444444444444",
      title: "Already published",
      lifecycle_status: "published",
      published_revision_id: "55555555-5555-4555-8555-555555555555",
      current_draft_revision_id: null,
      draftRevisionStatus: null,
      version: 7,
    });

    it("offers Take down only on a published story, never on a draft", async () => {
      const user = userEvent.setup();
      render(<MyStoriesView stories={[makeStory(), published]} />);

      const publishedMenu = await openMenu(user, "Already published");
      expect(
        within(publishedMenu).getByRole("menuitem", { name: "Take down" }),
      ).toBeInTheDocument();
      expect(
        within(publishedMenu).queryByRole("menuitem", { name: "Delete" }),
      ).not.toBeInTheDocument();
      await user.keyboard("{Escape}");

      // ...and the two destructive actions are never offered on the same
      // story: Delete belongs to the never-published draft, Take down to the
      // published one.
      const draftMenu = await openMenu(user);
      expect(
        within(draftMenu).getByRole("menuitem", { name: "Delete" }),
      ).toBeInTheDocument();
      expect(
        within(draftMenu).queryByRole("menuitem", { name: "Take down" }),
      ).not.toBeInTheDocument();
    });

    it("says what a takedown actually does before doing it, and can be backed out of", async () => {
      const { requestStoryTakedownAction } = await import("./actions");
      vi.mocked(requestStoryTakedownAction).mockClear();
      const user = userEvent.setup();
      render(<MyStoriesView stories={[published]} />);

      await openMenu(user, "Already published");
      await user.click(screen.getByRole("menuitem", { name: "Take down" }));

      expect(requestStoryTakedownAction).not.toHaveBeenCalled();
      expect(
        screen.getByRole("heading", {
          name: "Ask for this story to be taken down?",
        }),
      ).toBeInTheDocument();
      // The two things a contributor cannot work out from the button, and
      // the first one matters most: asking does NOT take the story down.
      // Someone who has just asked will otherwise assume it is already gone.
      expect(
        screen.getByText(/stays public until they do/i),
      ).toBeInTheDocument();
      expect(screen.getByText(/Nothing is deleted/i)).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Cancel" }));
      expect(
        screen.queryByRole("heading", {
          name: "Ask for this story to be taken down?",
        }),
      ).not.toBeInTheDocument();
      expect(requestStoryTakedownAction).not.toHaveBeenCalled();
    });

    it("passes the story's own version through as the concurrency token", async () => {
      const { requestStoryTakedownAction } = await import("./actions");
      vi.mocked(requestStoryTakedownAction).mockClear();
      const user = userEvent.setup();
      render(<MyStoriesView stories={[published]} />);

      await openMenu(user, "Already published");
      await user.click(screen.getByRole("menuitem", { name: "Take down" }));
      await user.click(
        screen.getByRole("button", { name: "Ask for takedown" }),
      );

      await waitFor(() =>
        expect(requestStoryTakedownAction).toHaveBeenCalledWith(
          "44444444-4444-4444-8444-444444444444",
          7,
        ),
      );
    });

    it("shows the reason a takedown was refused instead of failing silently", async () => {
      const { requestStoryTakedownAction } = await import("./actions");
      vi.mocked(requestStoryTakedownAction).mockResolvedValueOnce({
        ok: false,
        error: "This story has already been taken down.",
      });
      const user = userEvent.setup();
      render(
        <ToastProvider>
          <MyStoriesView stories={[published]} />
        </ToastProvider>,
      );

      await openMenu(user, "Already published");
      await user.click(screen.getByRole("menuitem", { name: "Take down" }));
      await user.click(
        screen.getByRole("button", { name: "Ask for takedown" }),
      );

      expect(
        await screen.findByText("This story has already been taken down."),
      ).toBeInTheDocument();
      // The dialog closes rather than sitting there looking busy forever.
      expect(
        screen.queryByRole("heading", {
          name: "Ask for this story to be taken down?",
        }),
      ).not.toBeInTheDocument();
    });
  });

  describe("location filtering", () => {
    const otago = makeStory({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      title: "A season in Otago",
      regions: [{ region_name: "Otago", destination_name: "Queenstown" }],
    });
    const nelson = makeStory({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
      title: "Nelson apples",
      regions: [{ region_name: "Nelson", destination_name: "Motueka" }],
    });

    it("shows a Region chip row only when the stories span more than one region, and narrows the list", async () => {
      const user = userEvent.setup();
      render(<MyStoriesView stories={[otago, nelson]} />);

      const regionGroup = screen.getByRole("group", {
        name: "Filter stories by region",
      });
      expect(
        within(regionGroup).getByRole("button", { name: "Nelson" }),
      ).toBeInTheDocument();
      // Both stories visible before filtering.
      expect(
        screen.getByRole("link", { name: "A season in Otago" }),
      ).toBeInTheDocument();

      await user.click(
        within(regionGroup).getByRole("button", { name: "Otago" }),
      );

      expect(
        screen.getByRole("link", { name: "A season in Otago" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: "Nelson apples" }),
      ).not.toBeInTheDocument();
    });

    describe("on a phone", () => {
      afterEach(() => {
        // @ts-expect-error -- jsdom has no matchMedia by default
        delete window.matchMedia;
      });

      it("moves the chip rows into a Filters sheet and badges the active count", async () => {
        Object.defineProperty(window, "matchMedia", {
          configurable: true,
          writable: true,
          value: (query: string) => ({
            matches: query.includes("max-width"),
            media: query,
            addEventListener: () => {},
            removeEventListener: () => {},
          }),
        });
        const user = userEvent.setup();
        render(<MyStoriesView stories={[otago, nelson]} />);

        await user.click(screen.getByRole("button", { name: "Filters" }));
        const sheet = screen.getByRole("dialog", { name: "Filters" });
        const regionGroup = within(sheet).getByRole("group", {
          name: "Filter stories by region",
        });
        // Wrapped, not a sideways scroller, inside the sheet.
        expect(regionGroup.className).toContain("flex-wrap");
        expect(regionGroup.className).not.toContain("overflow-x-auto");

        await user.click(
          within(regionGroup).getByRole("button", { name: "Nelson" }),
        );
        await user.click(
          within(sheet).getByRole("button", { name: "Show 1 story" }),
        );

        expect(
          screen.getByRole("button", { name: "Filters, 1 active" }),
        ).toBeInTheDocument();
        expect(
          screen.queryByRole("link", { name: "A season in Otago" }),
        ).not.toBeInTheDocument();
        expect(
          screen.getByRole("link", { name: "Nelson apples" }),
        ).toBeInTheDocument();
      });
    });

    it("filters on the Destination axis", async () => {
      const user = userEvent.setup();
      render(<MyStoriesView stories={[otago, nelson]} />);

      const destinationGroup = screen.getByRole("group", {
        name: "Filter stories by destination",
      });
      await user.click(
        within(destinationGroup).getByRole("button", { name: "Motueka" }),
      );

      expect(
        screen.queryByRole("link", { name: "A season in Otago" }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Nelson apples" }),
      ).toBeInTheDocument();
    });

    it("filters on the Tags axis, including a tag the contributor typed", async () => {
      // list_my_stories() resolves each tag to either a lookup row's name or
      // the contributor's own custom_label, so both filter identically here
      // (20260907110000). "cherry picking" below stands for the self-typed
      // kind, which is most of them on this product.
      const user = userEvent.setup();
      const vineyard = makeStory({
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaab1",
        title: "Marlborough vines",
        tags: ["vineyard work", "seasonal"],
      });
      const orchard = makeStory({
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaab2",
        title: "Otago orchards",
        tags: ["cherry picking"],
      });
      render(<MyStoriesView stories={[vineyard, orchard]} />);

      const tagGroup = screen.getByRole("group", {
        name: "Filter stories by tags",
      });
      await user.click(
        within(tagGroup).getByRole("button", { name: "cherry picking" }),
      );

      expect(
        screen.getByRole("link", { name: "Otago orchards" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: "Marlborough vines" }),
      ).not.toBeInTheDocument();
    });

    it("renders no Tags row when the contributor has never tagged anything", () => {
      // The same "an axis earns its row" rule the location axes follow -- a
      // control that cannot split the list is not rendered at all.
      render(<MyStoriesView stories={[otago, nelson]} />);
      expect(
        screen.queryByRole("group", { name: "Filter stories by tags" }),
      ).not.toBeInTheDocument();
    });

    it("renders no chip rows when every story shares one region", () => {
      render(
        <MyStoriesView
          stories={[
            otago,
            makeStory({
              id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
              title: "Another Otago story",
              regions: [
                { region_name: "Otago", destination_name: "Queenstown" },
              ],
            }),
          ]}
        />,
      );

      expect(
        screen.queryByRole("group", { name: /^Filter stories by/ }),
      ).not.toBeInTheDocument();
    });

    it("clears an active filter", async () => {
      const user = userEvent.setup();
      render(<MyStoriesView stories={[otago, nelson]} />);

      const regionGroup = screen.getByRole("group", {
        name: "Filter stories by region",
      });
      await user.click(
        within(regionGroup).getByRole("button", { name: "Otago" }),
      );
      expect(
        screen.queryByRole("link", { name: "Nelson apples" }),
      ).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "CLEAR" }));
      expect(
        screen.getByRole("link", { name: "Nelson apples" }),
      ).toBeInTheDocument();
    });

    it("shows a distinct empty message when a filter matches nothing", async () => {
      const user = userEvent.setup();
      render(<MyStoriesView stories={[otago, nelson]} />);

      const regionGroup = screen.getByRole("group", {
        name: "Filter stories by region",
      });
      const destinationGroup = screen.getByRole("group", {
        name: "Filter stories by destination",
      });
      await user.click(
        within(regionGroup).getByRole("button", { name: "Otago" }),
      );
      await user.click(
        within(destinationGroup).getByRole("button", { name: "Motueka" }),
      );

      expect(
        screen.getByText(/No stories match those filters/i),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(/haven't started a story yet/i),
      ).not.toBeInTheDocument();
    });
  });

  it("offers Edit on a published story with nothing in flight, and asks before starting one", async () => {
    const { startStoryRevisionAction } =
      await import("@/app/(contributor)/stories/[id]/preview/actions");
    const user = userEvent.setup();
    render(
      <MyStoriesView
        stories={[
          makeStory({
            lifecycle_status: "published",
            published_revision_id: "55555555-5555-4555-8555-555555555555",
            current_draft_revision_id: null,
            draftRevisionStatus: null,
          }),
        ]}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Edit Picking apples in Hawke's Bay",
      }),
    );

    // Nothing has been created yet -- the contributor is asked first, and
    // told the live story stays live.
    expect(startStoryRevisionAction).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: "Make changes to this story?" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/stays up, unchanged/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Yes, edit it" }));

    await waitFor(() =>
      expect(startStoryRevisionAction).toHaveBeenCalledWith(
        "11111111-1111-4111-8111-111111111111",
      ),
    );
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(
        "/stories/11111111-1111-4111-8111-111111111111/edit",
      ),
    );
  });

  it("backs out of starting a revision when the contributor says no", async () => {
    const { startStoryRevisionAction } =
      await import("@/app/(contributor)/stories/[id]/preview/actions");
    vi.mocked(startStoryRevisionAction).mockClear();
    const user = userEvent.setup();
    render(
      <MyStoriesView
        stories={[
          makeStory({
            lifecycle_status: "published",
            published_revision_id: "55555555-5555-4555-8555-555555555555",
            current_draft_revision_id: null,
            draftRevisionStatus: null,
          }),
        ]}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Edit Picking apples in Hawke's Bay",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(
      screen.queryByRole("heading", { name: "Make changes to this story?" }),
    ).not.toBeInTheDocument();
    expect(startStoryRevisionAction).not.toHaveBeenCalled();
  });

  it("swaps plain Edit for a reopen-for-review menu item while a published story's update is with a moderator, and says so", async () => {
    render(
      <MyStoriesView
        stories={[
          makeStory({
            lifecycle_status: "published",
            published_revision_id: "55555555-5555-4555-8555-555555555555",
            draftRevisionStatus: "submitted",
          }),
        ]}
      />,
    );

    // lifecycle_status is still "published" -- that is what keeps the live
    // version live -- so the submitted revision is the only signal there is.
    // Scoped to the row: "Published" now names the collapsible section too,
    // so an unscoped getByText matches twice.
    const row = screen.getByRole("listitem");
    expect(within(row).getByText("Published")).toBeInTheDocument();
    // Solid accent, not grey: next to the Published badge a grey chip read
    // as "not under review".
    expect(screen.getByText("Update in review")).toHaveClass(
      "bg-accent",
      "text-accent-foreground",
    );
    // A plain Edit link/button would save straight into a frozen revision, so
    // neither is offered...
    expect(
      screen.queryByRole("link", { name: /^Edit/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Edit (?!anyway)/ }),
    ).not.toBeInTheDocument();
    // ...but the story is not stuck: ReopenForEditingButton offers to pull
    // the submitted revision back out of the queue (from the menu).
    const menu = await openMenu(userEvent.setup());
    expect(
      within(menu).getByRole("menuitem", { name: "Edit anyway" }),
    ).toBeInTheDocument();
  });

  it("keeps Edit available on a published story's unsubmitted update", () => {
    render(
      <MyStoriesView
        stories={[
          makeStory({
            lifecycle_status: "published",
            published_revision_id: "55555555-5555-4555-8555-555555555555",
            draftRevisionStatus: "draft",
          }),
        ]}
      />,
    );

    expect(screen.getByText("Update in progress")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Edit Picking apples in Hawke's Bay" }),
    ).toHaveAttribute(
      "href",
      "/stories/11111111-1111-4111-8111-111111111111/edit",
    );
  });

  // Stories are grouped into collapsible sections by status. The pager that
  // used to live here went with the change: paging across groups is
  // incoherent, and collapsing a group is the better length control.
  function sectioned() {
    return [
      makeStory({
        id: "00000000-0000-4000-8000-000000000001",
        title: "A draft",
        lifecycle_status: "draft",
      }),
      makeStory({
        id: "00000000-0000-4000-8000-000000000002",
        title: "Sent back",
        lifecycle_status: "changes_requested",
      }),
      makeStory({
        id: "00000000-0000-4000-8000-000000000003",
        title: "With a moderator",
        lifecycle_status: "pending_review",
        draftRevisionStatus: "submitted",
      }),
      makeStory({
        id: "00000000-0000-4000-8000-000000000004",
        title: "Live one",
        lifecycle_status: "published",
        current_draft_revision_id: null,
        published_revision_id: "44444444-4444-4444-8444-444444444444",
      }),
    ] as MyStoryWithCover[];
  }

  function section(name: string) {
    return screen.getByRole("group", { name: new RegExp(name) });
  }

  it("groups stories into Drafts, In review and Published, each with a count", async () => {
    render(<MyStoriesView stories={sectioned()} />);

    expect(within(section("Drafts")).getByText("A draft")).toBeInTheDocument();
    expect(
      within(section("Drafts")).getByText("Sent back"),
    ).toBeInTheDocument();
    expect(
      within(section("In review")).getByText("With a moderator"),
    ).toBeInTheDocument();
    // A first submission sitting with a moderator is not a dead end either:
    // the reopen-for-editing icon button is offered right there in the
    // section, same as it is for a published story's in-flight update.
    const menu = await openMenu(userEvent.setup(), "With a moderator");
    expect(
      within(menu).getByRole("menuitem", { name: "Edit anyway" }),
    ).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(
      within(section("Published")).getByText("Live one"),
    ).toBeInTheDocument();

    // The count beside each label, so a collapsed section still says how much
    // is inside it.
    expect(within(section("Drafts")).getByText("2")).toBeInTheDocument();
    expect(within(section("Published")).getByText("1")).toBeInTheDocument();
  });

  it("gives a private story its own section, not the Not published one", () => {
    // A private story's lifecycle_status is neither published, nor a review
    // state, nor draft/changes_requested, so before it was handled
    // explicitly it fell through to `closed` and appeared under
    // "Not published — archived or not approved". That reads as something
    // having gone wrong, when it is exactly what the contributor asked for.
    render(
      <MyStoriesView
        stories={
          [
            ...sectioned(),
            makeStory({
              id: "00000000-0000-4000-8000-000000000005",
              title: "Just for me",
              lifecycle_status: "private",
              published_revision_id: null,
            }),
          ] as MyStoryWithCover[]
        }
      />,
    );

    expect(
      within(section("Private")).getByText("Just for me"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: /Not published/ }),
    ).not.toBeInTheDocument();
  });

  it("does not render a section with nothing in it", () => {
    render(<MyStoriesView stories={sectioned()} />);
    // Nothing here is rejected or archived, so the contributor is never told
    // about a "Not published" group they have never had.
    expect(
      screen.queryByRole("group", { name: /Not published/ }),
    ).not.toBeInTheDocument();
  });

  it("lands with Drafts collapsed and everything else open", () => {
    render(<MyStoriesView stories={sectioned()} />);

    // Drafts is the pile that only ever grows, so it starts folded to keep
    // Published above the fold. Folded, not hidden: the count is still there.
    expect(section("Drafts")).not.toHaveAttribute("open");
    expect(within(section("Drafts")).getByText("2")).toBeInTheDocument();

    expect(section("In review")).toHaveAttribute("open");
    expect(section("Published")).toHaveAttribute("open");
  });

  it("opens Drafts when you click it, without touching the other sections", async () => {
    const user = userEvent.setup();
    render(<MyStoriesView stories={sectioned()} />);

    await user.click(within(section("Drafts")).getByText("Drafts"));

    // <details> keeps its content in the DOM; what changes is the open state,
    // which is what a screen reader announces and what hides the rows.
    expect(section("Drafts")).toHaveAttribute("open");
    expect(section("Published")).toHaveAttribute("open");
    expect(screen.getByText("Live one")).toBeVisible();

    // And closing it again leaves its neighbours alone.
    await user.click(within(section("Drafts")).getByText("Drafts"));
    expect(section("Drafts")).not.toHaveAttribute("open");
    expect(section("Published")).toHaveAttribute("open");
  });

  it("keeps a published story with an update in review under Published", () => {
    // Engineering Rule 11: the live version stays live for the whole review,
    // so the story belongs where readers can still find it. The in-flight
    // edit shows as a chip on the row instead.
    render(
      <MyStoriesView
        stories={
          [
            makeStory({
              lifecycle_status: "published",
              published_revision_id: "44444444-4444-4444-8444-444444444444",
              current_draft_revision_id: "55555555-5555-4555-8555-555555555555",
              draftRevisionStatus: "submitted",
            }),
          ] as MyStoryWithCover[]
        }
      />,
    );

    expect(
      within(section("Published")).getByText("Picking apples in Hawke's Bay"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: /In review/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Update in review")).toBeInTheDocument();
  });

  it("numbers rows within a section rather than across the whole list", () => {
    render(<MyStoriesView stories={sectioned()} />);
    // Drafts holds two rows and Published one, so a per-section ordinal means
    // "01" appears in more than one place -- a continuous run would not.
    expect(screen.getAllByText("01").length).toBeGreaterThan(1);
  });

  // My Stories shows one country at a time (the one chosen in the top bar);
  // the page hands the view only that country's stories.
  describe("per country", () => {
    it("says there is no story about the chosen country, and starts one there", () => {
      render(
        <MyStoriesView stories={[]} country="china" hasStoriesElsewhere />,
      );
      expect(
        screen.getByText(/haven't written a story about China yet/i),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(/haven't started a story yet/i),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Start your first one" }),
      ).toHaveAttribute("href", "/stories/new?country=china");
    });

    it("keeps the first-story message when there are no stories anywhere", () => {
      render(<MyStoriesView stories={[]} />);
      expect(
        screen.getByText(/haven't started a story yet/i),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Start your first one" }),
      ).toHaveAttribute("href", "/stories/new");
    });
  });

  describe("photos", () => {
    const ids = [
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    ];

    it("lets a card with several photos swipe through all of them", async () => {
      const { container } = render(
        <MyStoriesView
          stories={[makeStory({ mediaIds: ids, coverMediaId: ids[0] })]}
        />,
      );
      // One strip slot per photo, each linking to the story like the card.
      const slots = container.querySelectorAll<HTMLAnchorElement>(
        '.snap-x > a[tabindex="-1"]',
      );
      expect(slots).toHaveLength(3);
      // The cover's signed URL arrives; the rest wait for a swipe.
      await waitFor(() =>
        expect(slots[0].querySelector("img")?.getAttribute("src")).toBe(
          `blob:signed-${ids[0]}`,
        ),
      );
      expect(slots[1].querySelector("img")).toBeNull();
    });

    it("keeps a single cover as a plain link, with no strip", () => {
      const { container } = render(<MyStoriesView stories={[makeStory()]} />);
      expect(container.querySelector(".snap-x")).toBeNull();
    });
  });

  describe("incremental loading", () => {
    // The shared test setup's observer reports "intersecting" the moment it
    // observes, which would auto-load every batch; default to one that never
    // fires and let the sentinel test drive its own.
    beforeEach(() => {
      vi.stubGlobal(
        "IntersectionObserver",
        class {
          observe() {}
          disconnect() {}
          unobserve() {}
        },
      );
    });

    function many(n: number, overrides: StoryOverrides = {}) {
      return Array.from({ length: n }, (_, i) =>
        makeStory({
          id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
          title: `Story ${i + 1}`,
          lifecycle_status: "published",
          published_revision_id: "44444444-4444-4444-8444-444444444444",
          current_draft_revision_id: null,
          coverMediaId: null,
          mediaIds: [],
          ...overrides,
        }),
      );
    }

    it("renders only the first batch, then reveals more on Show more", async () => {
      const user = userEvent.setup();
      render(<MyStoriesView stories={many(30)} />);

      expect(screen.getByText("Story 12")).toBeInTheDocument();
      expect(screen.queryByText("Story 13")).not.toBeInTheDocument();

      await user.click(
        screen.getByRole("button", { name: "Show more (18 left)" }),
      );
      expect(screen.getByText("Story 24")).toBeInTheDocument();
      expect(screen.queryByText("Story 25")).not.toBeInTheDocument();

      await user.click(
        screen.getByRole("button", { name: "Show more (6 left)" }),
      );
      expect(screen.getByText("Story 30")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /Show more/ }),
      ).not.toBeInTheDocument();
    });

    it("offers no Show more when everything fits in one batch", () => {
      render(<MyStoriesView stories={many(12)} />);
      expect(
        screen.queryByRole("button", { name: /Show more/ }),
      ).not.toBeInTheDocument();
    });

    it("loads the next batch when the sentinel scrolls into view", async () => {
      let trigger: (() => void) | undefined;
      class FakeObserver {
        constructor(cb: IntersectionObserverCallback) {
          trigger = () =>
            cb(
              [{ isIntersecting: true } as IntersectionObserverEntry],
              this as unknown as IntersectionObserver,
            );
        }
        observe() {}
        disconnect() {}
        unobserve() {}
      }
      vi.stubGlobal("IntersectionObserver", FakeObserver);
      try {
        render(<MyStoriesView stories={many(30)} />);
        expect(screen.queryByText("Story 13")).not.toBeInTheDocument();
        act(() => trigger?.());
        expect(await screen.findByText("Story 24")).toBeInTheDocument();
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("does not mint a cover URL until the card is near the viewport", async () => {
      const observed: Element[] = [];
      class IdleObserver {
        observe(el: Element) {
          observed.push(el);
        }
        disconnect() {}
        unobserve() {}
      }
      vi.stubGlobal("IntersectionObserver", IdleObserver);
      vi.mocked(mintPreviewUrlAction).mockClear();
      try {
        render(
          <MyStoriesView
            stories={many(3, {
              coverMediaId: "33333333-3333-4333-8333-333333333333",
              mediaIds: ["33333333-3333-4333-8333-333333333333"],
            })}
          />,
        );
        expect(
          observed.filter((el) => el.classList.contains("nf-skeleton")),
        ).toHaveLength(3);
        expect(mintPreviewUrlAction).not.toHaveBeenCalled();
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("filters by status chip across the whole list, not just the loaded batch", async () => {
      const user = userEvent.setup();
      const published = many(20);
      const drafts = Array.from({ length: 3 }, (_, i) =>
        makeStory({
          id: `99999999-9999-4999-8999-${String(i).padStart(12, "0")}`,
          title: `Draft ${i + 1}`,
          coverMediaId: null,
          mediaIds: [],
        }),
      );
      render(<MyStoriesView stories={[...drafts, ...published]} />);

      const tabs = screen.getByRole("group", { name: "Story status" });
      expect(
        within(tabs).getByRole("button", { name: /^All ?23$/ }),
      ).toBeInTheDocument();
      await user.click(
        within(tabs).getByRole("button", { name: /^Drafts ?3$/ }),
      );
      // Drafts is folded in the grouped view; its chip opens it and shows all.
      expect(screen.getByText("Draft 3")).toBeVisible();
      expect(screen.queryByText("Story 1")).not.toBeInTheDocument();

      await user.click(
        within(tabs).getByRole("button", { name: /^Published ?20$/ }),
      );
      expect(screen.getByText("Story 12")).toBeInTheDocument();
      expect(screen.queryByText("Story 13")).not.toBeInTheDocument();
    });
  });

  it("reorders rows when the sort changes and remembers the choice", async () => {
    const user = userEvent.setup();
    const stories = [
      makeStory({
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        title: "Zebra farm",
        lifecycle_status: "published",
        current_draft_revision_id: null,
        published_revision_id: "99999999-9999-4999-8999-999999999991",
        draftRevisionStatus: null,
        updated_at: "2026-09-01T00:00:00.000Z",
      }),
      makeStory({
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        title: "Apple orchard",
        lifecycle_status: "published",
        current_draft_revision_id: null,
        published_revision_id: "99999999-9999-4999-8999-999999999992",
        draftRevisionStatus: null,
        updated_at: "2026-08-01T00:00:00.000Z",
      }),
    ];
    render(<MyStoriesView stories={stories} />);

    const order = () =>
      screen
        .getAllByText(/^(Zebra farm|Apple orchard)$/)
        .map((el) => el.textContent);

    // Default: last edited, newest first -- Zebra (Sept) above Apple (Aug).
    expect(order()[0]).toBe("Zebra farm");

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Sort by" }),
      "title",
    );
    // A new key starts in its natural direction: Title opens A-Z.
    expect(store["kaki-my-stories-sort"]).toBe("title:asc");
    expect(order()[0]).toBe("Apple orchard");

    await user.click(screen.getByRole("button", { name: /Order: A–Z/ }));
    expect(store["kaki-my-stories-sort"]).toBe("title:desc");
    expect(order()[0]).toBe("Zebra farm");
  });
});
