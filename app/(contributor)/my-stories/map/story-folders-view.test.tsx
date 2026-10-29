import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import { StoryFoldersView } from "./story-folders-view";
import type { StoryFolderEntry } from "@/lib/story/story-folders";

const mockSetStoryParentAction = vi.fn();
vi.mock("./actions", () => ({
  setStoryParentAction: (...args: unknown[]) =>
    mockSetStoryParentAction(...args),
}));

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

function renderView(stories: StoryFolderEntry[]) {
  return render(
    <ToastProvider>
      <StoryFoldersView stories={stories} />
    </ToastProvider>,
  );
}

const kakiman: StoryFolderEntry = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "kakiman",
  title: "Kakiman",
  lifecycleStatus: "published",
  linkable: true,
  parentStoryId: null,
};

const opotiki: StoryFolderEntry = {
  id: "22222222-2222-4222-8222-222222222222",
  slug: "opotiki-trip",
  title: "Opotiki Trip",
  lifecycleStatus: "published",
  linkable: true,
  parentStoryId: kakiman.id,
};

const draftStory: StoryFolderEntry = {
  id: "33333333-3333-4333-8333-333333333333",
  slug: "untitled-story",
  title: "Untitled story",
  lifecycleStatus: "draft",
  linkable: false,
  parentStoryId: null,
};

beforeEach(() => {
  mockSetStoryParentAction.mockReset();
  refresh.mockReset();
});

describe("StoryFoldersView", () => {
  it("renders an empty state when the contributor has no stories", () => {
    renderView([]);
    expect(screen.getByText(/publish at least one story/i)).toBeInTheDocument();
  });

  it("gives screen readers translated drag instructions, not dnd-kit's default", () => {
    renderView([kakiman]);
    expect(
      screen.getByText(/to pick up a story, press space or enter/i),
    ).toBeInTheDocument();
  });

  it("shows a published, unfiled story as a collapsed folder row", () => {
    renderView([kakiman]);
    const toggle = screen.getByRole("button", { name: /kakiman/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("expands a folder to reveal its sub stories, and collapses again", async () => {
    const user = userEvent.setup();
    renderView([kakiman, opotiki]);

    const toggle = screen.getByRole("button", { name: /kakiman/i });
    expect(screen.queryByText("Opotiki Trip")).not.toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Opotiki Trip")).toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Opotiki Trip")).not.toBeInTheDocument();
  });

  it("files a story into a folder via the Move to select", async () => {
    const user = userEvent.setup();
    mockSetStoryParentAction.mockResolvedValue({ ok: true });
    const unfiled: StoryFolderEntry = {
      id: "44444444-4444-4444-8444-444444444444",
      slug: "trying-something-new",
      title: "Trying Something New",
      lifecycleStatus: "published",
      linkable: true,
      parentStoryId: null,
    };
    renderView([kakiman, unfiled]);

    const selects = screen.getAllByLabelText(/move to/i);
    // The second folder-capable row (Trying Something New, not yet filed).
    const select = selects[1];
    await user.selectOptions(select, kakiman.id);

    await waitFor(() =>
      expect(mockSetStoryParentAction).toHaveBeenCalledWith(
        unfiled.id,
        kakiman.id,
        null,
      ),
    );
  });

  it("rolls back the optimistic move and shows an error toast on refusal", async () => {
    const user = userEvent.setup();
    mockSetStoryParentAction.mockResolvedValue({
      ok: false,
      error: "This story already has sub stories.",
    });
    const unfiled: StoryFolderEntry = {
      id: "55555555-5555-4555-8555-555555555555",
      slug: "another-story",
      title: "Another Story",
      lifecycleStatus: "published",
      linkable: true,
      parentStoryId: null,
    };
    renderView([kakiman, unfiled]);

    const selects = screen.getAllByLabelText(/move to/i);
    await user.selectOptions(selects[1], kakiman.id);

    expect(
      await screen.findByText("This story already has sub stories."),
    ).toBeInTheDocument();
    // Rolled back: still shown as its own unfiled folder row, not nested.
    expect(
      screen.getByRole("button", { name: /another story/i }),
    ).toBeInTheDocument();
  });

  it("shows drafts in Not in a folder, greyed with a publish hint, not fileable", () => {
    renderView([kakiman, draftStory]);
    expect(screen.getByText("Untitled story")).toBeInTheDocument();
    expect(
      screen.getByText(/publish this story to file it/i),
    ).toBeInTheDocument();
    const draftSelect = screen
      .getAllByLabelText(/move to/i)
      .find((el) => el.closest("li")?.textContent?.includes("Untitled story"));
    expect(draftSelect).toBeDisabled();
  });
});
