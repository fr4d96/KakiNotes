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
  StoryStartersCard: ({ onHide }: { onHide: () => void }) => (
    <aside aria-label="Writing prompts">
      <button type="button" onClick={onHide}>
        Hide
      </button>
    </aside>
  ),
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

describe("StoryEditForm — the story's country (Places step)", () => {
  it("has no country picker: the header's flag sets a story's country", () => {
    render(<StoryEditForm {...baseProps()} />);
    expect(screen.queryByLabelText("Country")).not.toBeInTheDocument();
  });

  it("defaults to the story's current country and only lists that country's regions, for a curated (search-matched) row", () => {
    render(
      <StoryEditForm
        {...baseProps()}
        initialLocations={[
          {
            regionId: "r-otago",
            customRegionLabel: null,
            destinationId: null,
            customDestinationLabel: null,
            sortOrder: 0,
          },
        ]}
      />,
    );
    const regionSelect = screen.getByLabelText("Region");
    expect(
      within(regionSelect).queryByRole("option", { name: "Otago" }),
    ).not.toBeNull();
    expect(
      within(regionSelect).queryByRole("option", { name: "Guangdong" }),
    ).toBeNull();
  });

  it("lists only the matching country's regions for a curated row saved under that country", () => {
    render(
      <StoryEditForm
        {...baseProps()}
        initialCountrySlug="china"
        initialLocations={[
          {
            regionId: "r-guangdong",
            customRegionLabel: null,
            destinationId: null,
            customDestinationLabel: null,
            sortOrder: 0,
          },
        ]}
      />,
    );
    const regionSelect = screen.getByLabelText("Region");
    expect(
      within(regionSelect).queryByRole("option", { name: "Guangdong" }),
    ).not.toBeNull();
    expect(
      within(regionSelect).queryByRole("option", { name: "Otago" }),
    ).toBeNull();
  });
});

describe("StoryEditForm — place search placeholder/search scope per country", () => {
  it("uses the story's country's place example in the search placeholder", () => {
    const { unmount } = render(<StoryEditForm {...baseProps()} />);
    expect(
      screen.getByPlaceholderText("Type a full place name, e.g. Queenstown"),
    ).toBeInTheDocument();
    unmount();

    render(<StoryEditForm {...baseProps()} initialCountrySlug="china" />);
    expect(
      screen.getByPlaceholderText("Type a full place name, e.g. Guangzhou"),
    ).toBeInTheDocument();
  });
});

describe("StoryEditForm — Add a location manually (free-text region row)", () => {
  it("renders two plain-text inputs, not a region dropdown", async () => {
    const user = userEvent.setup();
    render(<StoryEditForm {...baseProps()} />);
    await user.click(screen.getByText("Add a location manually"));

    expect(screen.queryByLabelText("Region")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Region or area")).toBeInTheDocument();
    expect(screen.getByLabelText("Region or area").tagName).toBe("INPUT");
    expect(
      screen.getByLabelText("Town or place (optional)"),
    ).toBeInTheDocument();
  });

  it("marks the region/area input required and the town/place input optional", async () => {
    const user = userEvent.setup();
    render(<StoryEditForm {...baseProps()} />);
    await user.click(screen.getByText("Add a location manually"));

    expect(screen.getByLabelText("Region or area")).toBeRequired();
    expect(
      screen.getByLabelText("Town or place (optional)"),
    ).not.toBeRequired();
  });

  it("saves the typed region once it has text, not before", async () => {
    const user = userEvent.setup();
    render(<StoryEditForm {...baseProps()} />);
    await user.click(screen.getByText("Add a location manually"));

    // Not yet typed -- nothing to save.
    expect(setLocationsAction).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Region or area"), "Sichuan");
    await waitFor(() =>
      expect(setLocationsAction).toHaveBeenCalledWith(
        "22222222-2222-4222-8222-222222222222",
        expect.any(Number),
        [expect.objectContaining({ customRegionLabel: "Sichuan" })],
      ),
    );
  });

  it("loads a previously-saved typed-region row as two text inputs", () => {
    render(
      <StoryEditForm
        {...baseProps()}
        initialLocations={[
          {
            regionId: null,
            customRegionLabel: "Sichuan",
            destinationId: null,
            customDestinationLabel: "A village near Chengdu",
            sortOrder: 0,
          },
        ]}
      />,
    );
    expect(screen.getByDisplayValue("Sichuan")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("A village near Chengdu"),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Region")).not.toBeInTheDocument();
  });
});

describe("StoryEditForm — writing prompts behind the light bulb", () => {
  it("keeps the prompts closed until the bulb is pressed, and drops the step subtitle", async () => {
    const user = userEvent.setup();
    render(<StoryEditForm {...baseProps()} initialStep="story" />);

    expect(screen.queryByLabelText("Writing prompts")).toBeNull();
    expect(screen.queryByText("The writing itself")).toBeNull();

    const bulb = screen.getByRole("button", {
      name: "Ideas for what to write",
    });
    expect(bulb).toHaveAttribute("aria-expanded", "false");

    await user.click(bulb);
    expect(bulb).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("Writing prompts")).toBeInTheDocument();

    // "Hide" inside the card closes it again; so does a second bulb press.
    await user.click(screen.getByRole("button", { name: "Hide" }));
    expect(screen.queryByLabelText("Writing prompts")).toBeNull();
    await user.click(bulb);
    await user.click(bulb);
    expect(screen.queryByLabelText("Writing prompts")).toBeNull();
  });

  it("shows the bulb only on the story step", () => {
    render(<StoryEditForm {...baseProps()} />);
    expect(
      screen.queryByRole("button", { name: "Ideas for what to write" }),
    ).toBeNull();
  });
});
