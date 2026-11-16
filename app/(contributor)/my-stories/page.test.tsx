import { describe, expect, it, vi, beforeEach } from "vitest";

// My Stories shows only the stories of the country chosen in the top bar
// (the kakinotes-country cookie; New Zealand when none). Data readers are
// stubbed: this checks which stories the page hands the view.
const cookieValue = vi.hoisted(() => ({
  current: undefined as string | undefined,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () =>
      cookieValue.current === undefined
        ? undefined
        : { value: cookieValue.current },
  }),
}));
vi.mock("@/lib/story/contributor-queries", () => ({
  listMyStoriesWithCovers: vi.fn(async () => [
    { id: "nz-1", country_slug: "new-zealand" },
    { id: "nz-2", country_slug: "new-zealand" },
    { id: "cn-1", country_slug: "china" },
  ]),
}));
vi.mock("@/lib/story/mutations", () => ({
  listMyTakedownRequests: vi.fn(async () => []),
}));
vi.mock("./my-stories-view", () => ({ MyStoriesView: () => null }));
vi.mock("./submission-toast", () => ({ SubmissionToast: () => null }));

import MyStoriesPage from "./page";

type ViewProps = {
  stories: { id: string }[];
  country: string;
  hasStoriesElsewhere: boolean;
};

async function viewProps(): Promise<ViewProps> {
  const tree = await MyStoriesPage();
  const children = (tree.props as { children: React.ReactElement[] }).children;
  return children[1].props as ViewProps;
}

describe("My Stories page", () => {
  beforeEach(() => {
    cookieValue.current = undefined;
  });

  it("shows only China's stories when China is chosen", async () => {
    cookieValue.current = "china";
    const props = await viewProps();
    expect(props.stories.map((s) => s.id)).toEqual(["cn-1"]);
    expect(props.country).toBe("china");
    expect(props.hasStoriesElsewhere).toBe(true);
  });

  it("shows New Zealand's stories when nothing is chosen", async () => {
    const props = await viewProps();
    expect(props.stories.map((s) => s.id)).toEqual(["nz-1", "nz-2"]);
    expect(props.country).toBe("new-zealand");
  });

  it("treats an unknown cookie as New Zealand", async () => {
    cookieValue.current = "atlantis";
    const props = await viewProps();
    expect(props.stories.map((s) => s.id)).toEqual(["nz-1", "nz-2"]);
  });
});
