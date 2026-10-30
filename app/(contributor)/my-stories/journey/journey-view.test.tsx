import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import { JourneyStoryView } from "./journey-view";
import type { MyJourneyEntry } from "@/lib/journey/contributor-journey";

const mockSetPlace = vi.fn();
vi.mock("./actions", () => ({
  setStoryJourneyPlaceAction: (...args: unknown[]) => mockSetPlace(...args),
  resolveGoogleMapsLinkAction: vi.fn(async () => ({
    ok: false,
    reason: "invalid",
  })),
}));

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
  usePathname: () => "/my-stories/journey/11111111-1111-4111-8111-111111111111",
}));

function renderView(main: MyJourneyEntry, subs: MyJourneyEntry[] = []) {
  return render(
    <ToastProvider>
      <JourneyStoryView main={main} subs={subs} />
    </ToastProvider>,
  );
}

const main: MyJourneyEntry = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "south-island",
  title: "South Island",
  lifecycleStatus: "published",
  pinnable: true,
  isNewZealand: true,
  parentStoryId: null,
  place: { label: "Queenstown", latitude: -45.03, longitude: 168.66 },
};
const sub: MyJourneyEntry = {
  id: "22222222-2222-4222-8222-222222222222",
  slug: "arrowtown",
  title: "Arrowtown autumn",
  lifecycleStatus: "published",
  pinnable: true,
  isNewZealand: true,
  parentStoryId: main.id,
  place: null,
};
const draft: MyJourneyEntry = {
  id: "33333333-3333-4333-8333-333333333333",
  slug: "untitled",
  title: "Untitled story",
  lifecycleStatus: "draft",
  pinnable: false,
  isNewZealand: true,
  parentStoryId: null,
  place: null,
};
const china: MyJourneyEntry = {
  id: "44444444-4444-4444-8444-444444444444",
  slug: "beijing",
  title: "Beijing winter",
  lifecycleStatus: "published",
  pinnable: false,
  isNewZealand: false,
  parentStoryId: null,
  place: null,
};

beforeEach(() => {
  // The map checks prefers-reduced-motion; reduced motion keeps it static.
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
  mockSetPlace.mockReset();
  refresh.mockReset();
});

describe("JourneyStoryView", () => {
  it("names the journey and lists its sub stories under the main story", () => {
    renderView(main, [sub]);
    expect(
      screen.getByRole("heading", { level: 1, name: "South Island" }),
    ).toBeInTheDocument();
    const subList = screen.getByRole("list", {
      name: "Sub stories of South Island",
    });
    expect(within(subList).getByText("Arrowtown autumn")).toBeInTheDocument();
  });

  it("goes back to the Journey map list", () => {
    renderView(main);
    expect(
      screen.getByRole("link", { name: "Back to Journey map" }),
    ).toHaveAttribute("href", "/my-stories/journey");
  });

  it("offers Move pin and Remove pin on a pinned story, Pin on map on an unpinned one", () => {
    renderView(main, [sub]);
    expect(
      screen.getByRole("button", { name: "Move the pin for South Island" }),
    ).toHaveTextContent("Move pin");
    expect(
      screen.getByRole("button", { name: "Remove the pin for South Island" }),
    ).toHaveTextContent("Remove pin");
    expect(
      screen.getByRole("button", { name: "Pin Arrowtown autumn on the map" }),
    ).toHaveTextContent("Pin on map");
    expect(screen.getByText("Pinned at Queenstown")).toBeInTheDocument();
  });

  it("greys out a story outside New Zealand and says why", () => {
    renderView(china);
    expect(
      screen.getByText(/only new zealand stories can be pinned/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /on the map$/i })).toBeNull();
    expect(screen.getByTestId("journey-main-row")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("shows this journey on the map, above its stories", () => {
    renderView(main, [sub]);
    expect(
      screen.getByRole("heading", { name: "This journey on the map" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /^Read this story/ }),
    ).toHaveAttribute("href", "/stories/south-island");
  });

  it("says so when nothing from the journey is pinned yet", () => {
    renderView({ ...main, place: null });
    expect(
      screen.getByText(/nothing from this journey is on the map yet/i),
    ).toBeInTheDocument();
  });

  it("opens the place panel and keeps Save disabled until there is a spot and a name", async () => {
    const user = userEvent.setup();
    renderView(main, [sub]);
    await user.click(
      screen.getByRole("button", { name: "Pin Arrowtown autumn on the map" }),
    );
    const panel = screen.getByRole("group", {
      name: "Place for Arrowtown autumn",
    });
    expect(within(panel).getByLabelText("Place name")).toHaveAttribute(
      "maxlength",
      "60",
    );
    expect(
      within(panel).getByRole("button", { name: "Save pin" }),
    ).toBeDisabled();
    // The keyboard route to a spot, then a name.
    await user.click(
      within(panel).getByRole("button", {
        name: "Choose the middle of the map",
      }),
    );
    expect(
      within(panel).getByRole("button", { name: "Save pin" }),
    ).toBeDisabled();
    await user.type(within(panel).getByLabelText("Place name"), "Arrowtown");
    expect(
      within(panel).getByRole("button", { name: "Save pin" }),
    ).toBeEnabled();
  });

  it("saves a place through the action with only the story id and place", async () => {
    const user = userEvent.setup();
    mockSetPlace.mockImplementation(async (_id: string, place: unknown) => ({
      ok: true,
      place,
    }));
    renderView(main, [sub]);
    await user.click(
      screen.getByRole("button", { name: "Pin Arrowtown autumn on the map" }),
    );
    const panel = screen.getByRole("group", {
      name: "Place for Arrowtown autumn",
    });
    await user.click(
      within(panel).getByRole("button", {
        name: "Choose the middle of the map",
      }),
    );
    await user.type(within(panel).getByLabelText("Place name"), "Arrowtown");
    await user.click(within(panel).getByRole("button", { name: "Save pin" }));

    await waitFor(() => expect(mockSetPlace).toHaveBeenCalledTimes(1));
    const [storyId, place] = mockSetPlace.mock.calls[0];
    expect(storyId).toBe(sub.id);
    expect(Object.keys(place as object).sort()).toEqual([
      "label",
      "latitude",
      "longitude",
    ]);
    expect((place as { label: string }).label).toBe("Arrowtown");
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(screen.getByText("Pinned at Arrowtown")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: /place for/i })).toBeNull();
  });

  it("shows the server's message and keeps the panel open when saving fails", async () => {
    const user = userEvent.setup();
    mockSetPlace.mockResolvedValue({
      ok: false,
      error: "Only published stories can be pinned on your journey map.",
    });
    renderView(main);
    await user.click(
      screen.getByRole("button", { name: "Move the pin for South Island" }),
    );
    const panel = screen.getByRole("group", { name: "Place for South Island" });
    await user.click(within(panel).getByRole("button", { name: "Save pin" }));
    expect(await within(panel).findByRole("alert")).toHaveTextContent(
      /only published stories/i,
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it("removes a pin after confirmation, with a null place", async () => {
    const user = userEvent.setup();
    mockSetPlace.mockResolvedValue({ ok: true, place: null });
    renderView(main);
    await user.click(
      screen.getByRole("button", { name: "Remove the pin for South Island" }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Remove pin" }),
    );
    await waitFor(() =>
      expect(mockSetPlace).toHaveBeenCalledWith(main.id, null),
    );
    await waitFor(() =>
      expect(screen.queryByText("Pinned at Queenstown")).toBeNull(),
    );
  });
});
