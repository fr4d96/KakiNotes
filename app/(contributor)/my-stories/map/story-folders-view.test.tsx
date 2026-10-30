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
  usePathname: () => "/my-stories/map",
}));

function renderView(stories: StoryFolderEntry[]) {
  return render(
    <ToastProvider>
      <StoryFoldersView stories={stories} />
    </ToastProvider>,
  );
}

function published(
  id: string,
  title: string,
  parentStoryId: string | null = null,
): StoryFolderEntry {
  return {
    id,
    slug: title.toLowerCase().replace(/\s+/g, "-"),
    title,
    lifecycleStatus: "published",
    linkable: true,
    parentStoryId,
  };
}

const kakiman = published("11111111-1111-4111-8111-111111111111", "Kakiman");
const opotiki = published(
  "22222222-2222-4222-8222-222222222222",
  "Opotiki Trip",
  kakiman.id,
);
const tauranga = published(
  "44444444-4444-4444-8444-444444444444",
  "Tauranga Week",
);
const napier = published("55555555-5555-4555-8555-555555555555", "Napier");

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
  it("goes back to My Stories with an arrow, not a text link", () => {
    renderView([kakiman, opotiki]);
    expect(
      screen.getByRole("link", { name: "Back to My Stories" }),
    ).toHaveAttribute("href", "/my-stories");
  });

  it("renders an empty state when the contributor has no stories", () => {
    renderView([]);
    expect(screen.getByText(/publish at least one story/i)).toBeInTheDocument();
  });

  it("lists only folders that hold sub stories, not every unfiled story", () => {
    renderView([kakiman, opotiki, tauranga]);
    expect(
      screen.getByRole("button", { name: /kakiman/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Tauranga Week")).not.toBeInTheDocument();
  });

  it("says there are no folders yet instead of listing unfiled stories", () => {
    renderView([tauranga, napier]);
    expect(screen.getByText(/no folders yet/i)).toBeInTheDocument();
    expect(screen.queryByText("Napier")).not.toBeInTheDocument();
  });

  it("expands a folder to reveal its sub stories, and collapses again", async () => {
    const user = userEvent.setup();
    renderView([kakiman, opotiki]);

    const toggle = screen.getByRole("button", { name: /kakiman/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Opotiki Trip")).not.toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Opotiki Trip")).toBeInTheDocument();
    // The main story is listed too, with its own link.
    expect(screen.getByText("Main story")).toBeInTheDocument();
    const openLinks = screen.getAllByRole("link", { name: /open story/i });
    expect(openLinks.map((l) => l.getAttribute("href"))).toEqual([
      "/stories/kakiman",
      "/stories/opotiki-trip",
    ]);

    await user.click(toggle);
    expect(screen.queryByText("Opotiki Trip")).not.toBeInTheDocument();
  });

  it("picks a main story, then files the ticked sub stories under it", async () => {
    const user = userEvent.setup();
    mockSetStoryParentAction.mockResolvedValue({ ok: true });
    renderView([tauranga, napier, kakiman]);

    await user.click(screen.getByRole("button", { name: /new folder/i }));
    await user.click(screen.getByRole("button", { name: /tauranga week/i }));
    await user.click(screen.getByRole("checkbox", { name: /napier/i }));
    await user.click(screen.getByRole("checkbox", { name: /kakiman/i }));
    await user.click(
      screen.getByRole("button", { name: /save · 2 sub stories/i }),
    );

    await waitFor(() =>
      expect(mockSetStoryParentAction).toHaveBeenCalledTimes(2),
    );
    expect(mockSetStoryParentAction).toHaveBeenCalledWith(
      napier.id,
      tauranga.id,
      null,
    );
    expect(mockSetStoryParentAction).toHaveBeenCalledWith(
      kakiman.id,
      tauranga.id,
      null,
    );
    expect(
      await screen.findByText(/saved “tauranga week” with 2 sub stories/i),
    ).toBeInTheDocument();
    // The new folder shows, already expanded.
    expect(
      screen.getByRole("button", { name: /tauranga week/i }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("keeps Save disabled until something changes", async () => {
    const user = userEvent.setup();
    renderView([tauranga, napier]);
    await user.click(screen.getByRole("button", { name: /new folder/i }));
    await user.click(screen.getByRole("button", { name: /tauranga week/i }));
    expect(
      screen.getByRole("button", { name: /save · no sub stories/i }),
    ).toBeDisabled();
  });

  it("opens a folder with its current sub stories ticked, and unticking removes one", async () => {
    const user = userEvent.setup();
    mockSetStoryParentAction.mockResolvedValue({ ok: true });
    renderView([kakiman, opotiki, napier]);
    await user.click(screen.getByRole("button", { name: /kakiman/i }));
    await user.click(screen.getByRole("button", { name: /add sub stories/i }));

    const opotikiBox = screen.getByRole("checkbox", { name: /opotiki trip/i });
    expect(opotikiBox).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /napier/i })).not.toBeChecked();

    await user.click(opotikiBox);
    await user.click(
      screen.getByRole("button", { name: /save · no sub stories/i }),
    );
    await waitFor(() =>
      expect(mockSetStoryParentAction).toHaveBeenCalledWith(
        opotiki.id,
        null,
        kakiman.id,
      ),
    );
    expect(mockSetStoryParentAction).toHaveBeenCalledTimes(1);
  });

  it("offers neither the main story nor drafts as sub stories", async () => {
    const user = userEvent.setup();
    renderView([kakiman, opotiki, napier, draftStory]);
    await user.click(screen.getByRole("button", { name: /kakiman/i }));
    await user.click(screen.getByRole("button", { name: /add sub stories/i }));

    expect(
      screen.getByRole("checkbox", { name: /napier/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: /kakiman/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: /untitled story/i }),
    ).not.toBeInTheDocument();
  });

  it("rolls back a refused filing and shows the error", async () => {
    const user = userEvent.setup();
    mockSetStoryParentAction.mockResolvedValue({
      ok: false,
      error: "This story already has sub stories.",
    });
    renderView([tauranga, napier]);

    await user.click(screen.getByRole("button", { name: /new folder/i }));
    await user.click(screen.getByRole("button", { name: /tauranga week/i }));
    await user.click(screen.getByRole("checkbox", { name: /napier/i }));
    await user.click(
      screen.getByRole("button", { name: /save · 1 sub story/i }),
    );

    expect(
      await screen.findByText("This story already has sub stories."),
    ).toBeInTheDocument();
    expect(screen.getByText(/no folders yet/i)).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("removes a sub story after confirming", async () => {
    const user = userEvent.setup();
    mockSetStoryParentAction.mockResolvedValue({ ok: true });
    renderView([kakiman, opotiki]);

    await user.click(screen.getByRole("button", { name: /kakiman/i }));
    await user.click(
      screen.getByRole("button", { name: /remove from folder/i }),
    );
    await user.click(screen.getByRole("button", { name: /^remove$/i }));

    await waitFor(() =>
      expect(mockSetStoryParentAction).toHaveBeenCalledWith(
        opotiki.id,
        null,
        kakiman.id,
      ),
    );
  });

  it("sums drafts up in one line instead of listing them", () => {
    renderView([kakiman, opotiki, draftStory]);
    expect(screen.getByText(/1 draft isn’t shown/i)).toBeInTheDocument();
    expect(screen.queryByText("Untitled story")).not.toBeInTheDocument();
  });
});
