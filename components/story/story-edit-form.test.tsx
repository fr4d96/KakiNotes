import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { ActiveCountry, ActiveRegion } from "@/lib/story/active-lookups";
import { setTestLocale } from "@/tests/support/i18n";

// Every Server Action this form calls is stubbed -- this file tests the
// Places step's country-awareness (select, filtering, clearing locations on
// change, the read-only published state), not the save pipeline itself
// (covered by the RPC/migration and the edit/actions.test.ts coverage for
// each action's own validation).
const setCountryAction = vi.fn<
  () => Promise<{ ok: true } | { ok: false; error: string }>
>(async () => ({ ok: true }));
const setLocationsAction = vi.fn(async () => ({ ok: true as const }));

vi.mock("@/app/(contributor)/stories/[id]/edit/actions", () => ({
  saveRevisionFieldsAction: vi.fn(async () => ({ ok: true, version: 2 })),
  setLocationsAction: (...args: unknown[]) =>
    setLocationsAction(...(args as [])),
  setTagsAction: vi.fn(async () => ({ ok: true })),
  setExpensesAction: vi.fn(async () => ({ ok: true })),
  setCountryAction: (...args: unknown[]) => setCountryAction(...(args as [])),
}));

// Every heavy child not relevant to the Places step is replaced with a
// minimal stand-in -- StepSection keeps every step MOUNTED (just hidden)
// regardless of which one is active (story-edit-form.tsx's own comment:
// the rich text editor is uncontrolled, so unmounting it would lose the
// document), so all of these mount during every render of this form, not
// only when their own step is open.
vi.mock("@/components/story/story-content-editor", () => ({
  StoryContentEditor: () => null,
}));
vi.mock("@/components/story/image-upload-manager", () => ({
  ImageUploadManager: () => null,
}));
vi.mock("@/components/story/content-import-panel", () => ({
  ContentImportPanel: () => null,
}));
vi.mock("@/components/story/story-starters-card", () => ({
  StoryStartersCard: () => null,
}));
vi.mock("@/components/story/tag-editor", () => ({
  TagEditor: () => null,
}));
vi.mock("@/components/story/expense-breakdown", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/components/story/expense-breakdown")
    >();
  return { ...actual, ExpenseBreakdown: () => null };
});
vi.mock("@/components/story/expense-donut", () => ({
  ExpenseDonut: () => null,
}));
vi.mock("@/components/story/trip-date-field", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/components/story/trip-date-field")>();
  return { ...actual, TripDateField: () => null };
});

const { StoryEditForm } = await import("./story-edit-form");

const NZ_REGION: ActiveRegion = {
  id: "r-otago",
  name: "Otago",
  slug: "otago",
  islandOrGrouping: "South Island",
  name_zh_cn: null,
  countrySlug: "new-zealand",
};
const CHINA_REGION: ActiveRegion = {
  id: "r-guangdong",
  name: "Guangdong",
  slug: "guangdong",
  islandOrGrouping: null,
  name_zh_cn: "广东",
  countrySlug: "china",
};
const COUNTRIES: ActiveCountry[] = [
  {
    id: "c-nz",
    slug: "new-zealand",
    code: "nz",
    name: "New Zealand",
    name_zh_cn: "新西兰",
  },
  { id: "c-cn", slug: "china", code: "cn", name: "China", name_zh_cn: "中国" },
];

function baseProps() {
  return {
    storyId: "11111111-1111-4111-8111-111111111111",
    revisionId: "22222222-2222-4222-8222-222222222222",
    initialVersion: 1,
    initialTitle: "My story",
    initialExcerpt: "",
    initialContentJson: [],
    initialTripStartDate: null,
    initialTripEndDate: null,
    initialTripYear: null,
    initialTravelStyle: null,
    initialTotalExpenseNzdCents: null,
    initialContributorNote: "",
    initialLocations: [],
    initialTags: [],
    initialExpenses: [],
    initialMedia: [],
    regions: [NZ_REGION, CHINA_REGION],
    destinations: [],
    countries: COUNTRIES,
    initialCountrySlug: "new-zealand",
    tags: [],
    expenseCategories: [],
    initialStep: "places" as const,
  };
}

beforeEach(() => {
  setCountryAction.mockClear();
  setLocationsAction.mockClear();
});

afterEach(() => {
  setTestLocale("en");
});

describe("StoryEditForm — Country select (Places step)", () => {
  it("defaults to the story's current country and only lists that country's regions", async () => {
    const user = userEvent.setup();
    render(<StoryEditForm {...baseProps()} />);
    const countrySelect = screen.getByLabelText("Country");
    expect(countrySelect).toHaveValue("new-zealand");
    await user.click(screen.getByText("Add a location manually"));
    const regionSelect = screen.getByLabelText("Region");
    expect(
      within(regionSelect).queryByRole("option", { name: "Otago" }),
    ).not.toBeNull();
    expect(
      within(regionSelect).queryByRole("option", { name: "Guangdong" }),
    ).toBeNull();
  });

  it("switches the region list when the country changes", async () => {
    const user = userEvent.setup();
    render(<StoryEditForm {...baseProps()} />);
    await user.selectOptions(screen.getByLabelText("Country"), "china");

    await waitFor(() =>
      expect(setCountryAction).toHaveBeenCalledWith(
        "11111111-1111-4111-8111-111111111111",
        "china",
      ),
    );

    // Region options rendered inline on manually-added rows only show up
    // once a row exists; add one to assert the filter.
    await user.click(screen.getByText("Add a location manually"));
    const regionSelect = screen.getByLabelText("Region");
    expect(
      within(regionSelect).queryByRole("option", { name: "Guangdong" }),
    ).not.toBeNull();
    expect(
      within(regionSelect).queryByRole("option", { name: "Otago" }),
    ).toBeNull();
  });

  it("clears existing location rows and shows a notice when the country changes", async () => {
    const user = userEvent.setup();
    render(
      <StoryEditForm
        {...baseProps()}
        initialLocations={[
          {
            regionId: "r-otago",
            destinationId: null,
            customDestinationLabel: "Queenstown",
            sortOrder: 0,
          },
        ]}
      />,
    );
    expect(screen.getByDisplayValue("Queenstown")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Country"), "china");

    expect(screen.queryByDisplayValue("Queenstown")).not.toBeInTheDocument();
    expect(
      screen.getByText(/Locations for the previous country were cleared/i),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(setLocationsAction).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.arrayContaining([
          expect.objectContaining({ regionId: "r-otago" }),
        ]),
      ),
    );
  });

  it("reverts the country and restores the notice-free state if the save fails", async () => {
    setCountryAction.mockResolvedValueOnce({
      ok: false,
      error: "Country can't be changed after a story is published",
    });
    const user = userEvent.setup();
    render(<StoryEditForm {...baseProps()} />);
    await user.selectOptions(screen.getByLabelText("Country"), "china");

    await waitFor(() =>
      expect(
        screen.getAllByText(
          "Country can't be changed after a story is published",
        ).length,
      ).toBeGreaterThan(0),
    );
    expect(screen.getByLabelText("Country")).toHaveValue("new-zealand");
  });
});

describe("StoryEditForm — published stories lock the country", () => {
  it("shows the country as read-only text with a hint instead of a select", () => {
    render(<StoryEditForm {...baseProps()} isPublished />);
    expect(screen.queryByLabelText("Country")).not.toBeInTheDocument();
    expect(screen.getByText("New Zealand")).toBeInTheDocument();
    expect(
      screen.getByText("Country can't be changed after a story is published."),
    ).toBeInTheDocument();
  });
});

describe("StoryEditForm — place search placeholder/search scope per country", () => {
  it("uses the selected country's place example in the search placeholder", async () => {
    render(<StoryEditForm {...baseProps()} />);
    expect(
      screen.getByPlaceholderText("Type a full place name, e.g. Queenstown"),
    ).toBeInTheDocument();

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Country"), "china");
    expect(
      screen.getByPlaceholderText("Type a full place name, e.g. Guangzhou"),
    ).toBeInTheDocument();
  });
});
