import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { LinkMainStoryAction } from "./link-main-story-dialog";
import { ToastProvider } from "@/components/ui/toast";

const mockLoadLinkMainStoryDataAction = vi.fn();
const mockLinkMainStoryAction = vi.fn();
vi.mock("./actions", () => ({
  loadLinkMainStoryDataAction: (...args: unknown[]) =>
    mockLoadLinkMainStoryDataAction(...args),
  linkMainStoryAction: (...args: unknown[]) => mockLinkMainStoryAction(...args),
}));

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const STORY_ID = "11111111-1111-4111-8111-111111111111";
const PARENT_ID = "33333333-3333-4333-8333-333333333333";
const TITLE = "Fergburger";

function renderAction() {
  return render(
    <ToastProvider>
      <LinkMainStoryAction storyId={STORY_ID} title={TITLE} />
    </ToastProvider>,
  );
}

function loaded(
  data: Partial<{
    parent: { storyId: string; title: string | null; slug: string } | null;
    hasSubStories: boolean;
    options: { storyId: string; title: string; slug: string }[];
  }> = {},
) {
  mockLoadLinkMainStoryDataAction.mockResolvedValue({
    ok: true,
    data: {
      parent: null,
      hasSubStories: false,
      options: [
        { storyId: PARENT_ID, title: "Food in Queenstown", slug: "food" },
      ],
      ...data,
    },
  });
}

async function openDialog() {
  const user = userEvent.setup();
  renderAction();
  const trigger = screen.getByRole("button", {
    name: /main story.*Fergburger/i,
  });
  await user.click(trigger);
  const dialog = await screen.findByRole("dialog");
  return { user, trigger, dialog };
}

beforeEach(() => {
  mockLoadLinkMainStoryDataAction.mockReset();
  mockLinkMainStoryAction.mockReset();
  refresh.mockClear();
});

describe("LinkMainStoryAction", () => {
  it("has an accessible trigger that opens a labelled dialog and loads this story", async () => {
    loaded();
    const { dialog } = await openDialog();

    expect(dialog).toHaveAccessibleName(/Fergburger/i);
    expect(mockLoadLinkMainStoryDataAction).toHaveBeenCalledWith(STORY_ID);
    expect(
      await screen.findByText(/shows on both pages straight away/i),
    ).toBeInTheDocument();
  });

  it("saves the picked main story by story id and refreshes the page", async () => {
    loaded();
    mockLinkMainStoryAction.mockResolvedValue({ ok: true });
    const { user } = await openDialog();

    await user.selectOptions(
      await screen.findByRole("combobox"),
      "Food in Queenstown",
    );
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(mockLinkMainStoryAction).toHaveBeenCalledWith(STORY_ID, PARENT_ID);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("can clear an existing main story", async () => {
    loaded({
      parent: { storyId: PARENT_ID, title: "Food in Queenstown", slug: "food" },
    });
    mockLinkMainStoryAction.mockResolvedValue({ ok: true });
    const { user } = await openDialog();

    const select = await screen.findByRole("combobox");
    expect(select).toHaveValue(PARENT_ID);
    await user.selectOptions(select, "");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(mockLinkMainStoryAction).toHaveBeenCalledWith(STORY_ID, null);
  });

  it("keeps Save disabled until the choice changes", async () => {
    loaded();
    await openDialog();

    await screen.findByRole("combobox");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("disables the picker and save when other stories are already linked under this one", async () => {
    loaded({ hasSubStories: true });
    await openDialog();

    expect(await screen.findByRole("combobox")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("shows a load failure instead of the picker", async () => {
    mockLoadLinkMainStoryDataAction.mockResolvedValue({
      ok: false,
      error: "Could not load this story.",
    });
    await openDialog();

    expect(
      await screen.findByText("Could not load this story."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });

  it("shows a save error inline instead of closing the dialog", async () => {
    loaded();
    mockLinkMainStoryAction.mockResolvedValue({
      ok: false,
      error: "Only published stories can be linked.",
    });
    const { user, dialog } = await openDialog();

    await user.selectOptions(
      await screen.findByRole("combobox"),
      "Food in Queenstown",
    );
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Only published stories can be linked.",
    );
    expect(dialog).toHaveAttribute("open");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("closes on Cancel and returns focus to the trigger button", async () => {
    loaded();
    const { user, trigger, dialog } = await openDialog();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(dialog).not.toHaveAttribute("open");
    expect(trigger).toHaveFocus();
  });
});
