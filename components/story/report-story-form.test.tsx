import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportStoryForm } from "@/components/story/report-story-form";
import { setTestLocale } from "@/tests/support/i18n";

// The real action is "use server" and reaches Supabase; the contract under
// test here is only what the form renders for each state it can return.
const { reportStoryAction } = vi.hoisted(() => ({
  reportStoryAction: vi.fn(),
}));
vi.mock("@/app/(public)/stories/[id]/actions", () => ({
  reportStoryAction,
}));

const STORY_ID = "9a7f2a0e-3d1c-4b6a-8c2f-1e5d7b9c0a11";
const STORY_SLUG = "landing-in-auckland-fead0308";

async function openAndSubmit() {
  render(<ReportStoryForm storyId={STORY_ID} storySlug={STORY_SLUG} />);
  fireEvent.click(screen.getByRole("button", { name: "Report this story" }));
  fireEvent.change(screen.getByLabelText("Reason"), {
    target: { value: "other" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Submit report" }));
}

afterEach(() => {
  reportStoryAction.mockReset();
  setTestLocale("en");
});

describe("ReportStoryForm", () => {
  it("posts the story's uuid, which is what the schema wants", async () => {
    reportStoryAction.mockResolvedValue({ status: "success" });
    await openAndSubmit();
    await waitFor(() => expect(reportStoryAction).toHaveBeenCalled());
    const formData = reportStoryAction.mock.calls[0][1] as FormData;
    expect(formData.get("storyId")).toBe(STORY_ID);
  });

  it("sends a signed-out visitor back to the story by SLUG, never by uuid", async () => {
    // The regression this pins: the public route resolves by slug, so a
    // `next` built from the uuid landed a freshly signed-in visitor on a
    // 404 instead of the story they had just tried to report.
    reportStoryAction.mockResolvedValue({ status: "needs-sign-in" });
    await openAndSubmit();

    const link = await screen.findByRole("link", { name: "sign in" });
    const href = link.getAttribute("href")!;
    const next = new URL(href, "http://localhost").searchParams.get("next");
    expect(next).toBe(`/stories/${STORY_SLUG}`);
    expect(next).not.toContain(STORY_ID);
  });

  it("renders the needs-sign-in prompt in Chinese with the same return path", async () => {
    setTestLocale("zh-CN");
    reportStoryAction.mockResolvedValue({ status: "needs-sign-in" });
    render(<ReportStoryForm storyId={STORY_ID} storySlug={STORY_SLUG} />);
    fireEvent.click(screen.getByRole("button", { name: "举报这篇故事" }));
    fireEvent.change(screen.getByLabelText("原因"), {
      target: { value: "other" },
    });
    fireEvent.click(screen.getByRole("button", { name: "提交举报" }));

    const link = await screen.findByRole("link", { name: "登录" });
    expect(
      new URL(link.getAttribute("href")!, "http://localhost").searchParams.get(
        "next",
      ),
    ).toBe(`/stories/${STORY_SLUG}`);
  });

  it("shows the neutral confirmation on success", async () => {
    reportStoryAction.mockResolvedValue({ status: "success" });
    await openAndSubmit();
    expect(
      await screen.findByText(
        "Thanks — your report has been submitted for review.",
      ),
    ).toBeInTheDocument();
  });
});
