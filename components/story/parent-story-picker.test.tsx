import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ParentStoryPicker } from "./parent-story-picker";

const options = [
  { storyId: "s1", title: "Food in Queenstown" },
  { storyId: "s2", title: "Working at the orchard" },
];

function setup(
  props: Partial<React.ComponentProps<typeof ParentStoryPicker>> = {},
) {
  const onChange = vi.fn();
  render(
    <ParentStoryPicker
      value={null}
      currentParent={null}
      options={options}
      hasSubStories={false}
      onChange={onChange}
      {...props}
    />,
  );
  return { onChange, select: screen.getByLabelText(/main story/i) };
}

describe("ParentStoryPicker", () => {
  it("renders the none option and every option", () => {
    setup();
    expect(
      screen.getByRole("option", { name: /none — this is its own story/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Food in Queenstown" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(3);
    expect(
      screen.getByText(/one of your other published stories/i),
    ).toBeVisible();
  });

  it("reports the chosen story id", async () => {
    const { onChange, select } = setup();
    await userEvent.selectOptions(select, "s2");
    expect(onChange).toHaveBeenCalledWith("s2");
  });

  it("reports null when choosing none", async () => {
    const { onChange, select } = setup({ value: "s1" });
    expect(select).toHaveValue("s1");
    await userEvent.selectOptions(select, "");
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("keeps a current parent that is no longer an option selected", () => {
    const { select } = setup({
      value: "gone",
      currentParent: { storyId: "gone", title: "Archived main story" },
    });
    expect(select).toHaveValue("gone");
    expect(
      screen.getByRole("option", { name: "Archived main story" }),
    ).toBeInTheDocument();
  });

  it("disables the select and explains why when it has sub stories", () => {
    const { select } = setup({ hasSubStories: true });
    expect(select).toBeDisabled();
    expect(screen.getByText(/can't become a sub story/i)).toBeInTheDocument();
    expect(select).toHaveAccessibleDescription(/can't become a sub story/i);
  });

  it("says to publish another story when there are no options", () => {
    const { select } = setup({ options: [] });
    expect(select).toBeEnabled();
    expect(
      screen.getByText(/publish another story first/i),
    ).toBeInTheDocument();
  });
});
