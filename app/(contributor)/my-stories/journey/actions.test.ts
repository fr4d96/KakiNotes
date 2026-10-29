import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRevalidatePath = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}));

const mockGetCurrentUser = vi.fn();
vi.mock("@/lib/auth/get-current-user", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

const mockSetStoryJourneyPlace = vi.fn();
vi.mock("@/lib/story/mutations", () => ({
  setStoryJourneyPlace: (...args: unknown[]) =>
    mockSetStoryJourneyPlace(...args),
}));

const mockGetMyJourney = vi.fn();
vi.mock("@/lib/story/journey-queries", () => ({
  getMyJourney: () => mockGetMyJourney(),
}));

const mockInvalidateStoryPublicCache = vi.fn();
const mockInvalidateStoryListingsPublicCache = vi.fn();
vi.mock("@/lib/story/public-cache", () => ({
  invalidateStoryPublicCache: (...args: unknown[]) =>
    mockInvalidateStoryPublicCache(...args),
  invalidateStoryListingsPublicCache: () =>
    mockInvalidateStoryListingsPublicCache(),
}));

const mockLogAppEvent = vi.fn();
vi.mock("@/lib/log", () => ({
  logAppEvent: (...args: unknown[]) => mockLogAppEvent(...args),
}));

const user = { id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" };
const STORY_A = "11111111-1111-4111-8111-111111111111";

import {
  resolveGoogleMapsLinkAction,
  setStoryJourneyPlaceAction,
} from "./actions";

const place = {
  label: " Near Cromwell ",
  latitude: -45.0312,
  longitude: 169.1999,
};

beforeEach(() => {
  mockRevalidatePath.mockReset();
  mockGetCurrentUser.mockReset();
  mockSetStoryJourneyPlace.mockReset();
  mockGetMyJourney.mockReset();
  mockInvalidateStoryPublicCache.mockReset();
  mockInvalidateStoryListingsPublicCache.mockReset();
  mockLogAppEvent.mockReset();
  mockGetMyJourney.mockResolvedValue([{ id: STORY_A, slug: "story-a" }]);
});

describe("setStoryJourneyPlaceAction", () => {
  it("pins a story with the validated, trimmed, rounded place and logs it", async () => {
    mockGetCurrentUser.mockResolvedValue(user);
    mockSetStoryJourneyPlace.mockResolvedValue(undefined);

    const result = await setStoryJourneyPlaceAction(STORY_A, place);

    const rounded = {
      label: "Near Cromwell",
      latitude: -45.03,
      longitude: 169.2,
    };
    expect(result).toEqual({ ok: true, place: rounded });
    expect(mockSetStoryJourneyPlace).toHaveBeenCalledWith(STORY_A, rounded);
    expect(mockLogAppEvent).toHaveBeenCalledWith({
      event: "story.journey.set",
      target: STORY_A,
      outcome: "success",
    });
  });

  it("clears the pin with a null place and logs story.journey.cleared", async () => {
    mockGetCurrentUser.mockResolvedValue(user);
    mockSetStoryJourneyPlace.mockResolvedValue(undefined);

    const result = await setStoryJourneyPlaceAction(STORY_A, null);

    expect(result).toEqual({ ok: true, place: null });
    expect(mockSetStoryJourneyPlace).toHaveBeenCalledWith(STORY_A, null);
    expect(mockLogAppEvent).toHaveBeenCalledWith({
      event: "story.journey.cleared",
      target: STORY_A,
      outcome: "success",
    });
  });

  it("revalidates the profile, journey, my-stories and story pages", async () => {
    mockGetCurrentUser.mockResolvedValue(user);
    mockSetStoryJourneyPlace.mockResolvedValue(undefined);

    await setStoryJourneyPlaceAction(STORY_A, place);

    expect(mockRevalidatePath).toHaveBeenCalledWith("/my-stories/journey");
    expect(mockRevalidatePath).toHaveBeenCalledWith(
      "/contributors/[slug]",
      "page",
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith(
      "/contributors/[slug]/journey",
      "page",
    );
    expect(mockInvalidateStoryPublicCache).toHaveBeenCalledWith("story-a");
  });

  it("falls back to listings-only invalidation when the slug can't be resolved", async () => {
    mockGetCurrentUser.mockResolvedValue(user);
    mockSetStoryJourneyPlace.mockResolvedValue(undefined);
    mockGetMyJourney.mockRejectedValue(new Error("down"));

    const result = await setStoryJourneyPlaceAction(STORY_A, place);

    expect(result.ok).toBe(true);
    expect(mockInvalidateStoryPublicCache).not.toHaveBeenCalled();
    expect(mockInvalidateStoryListingsPublicCache).toHaveBeenCalled();
  });

  it("rejects a signed-out caller without calling the mutation", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const result = await setStoryJourneyPlaceAction(STORY_A, place);
    expect(result.ok).toBe(false);
    expect(mockSetStoryJourneyPlace).not.toHaveBeenCalled();
  });

  it("rejects a non-uuid story id", async () => {
    mockGetCurrentUser.mockResolvedValue(user);
    const result = await setStoryJourneyPlaceAction("nope", place);
    expect(result.ok).toBe(false);
    expect(mockSetStoryJourneyPlace).not.toHaveBeenCalled();
  });

  it.each([
    ["a blank name", { ...place, label: "  " }],
    ["a name over 60 characters", { ...place, label: "x".repeat(61) }],
    ["a place outside New Zealand", { ...place, latitude: -33.8 }],
    ["a missing coordinate", { label: "x", latitude: -45 }],
    ["a non-object", "Cromwell"],
  ])("rejects %s before calling the mutation", async (_, bad) => {
    mockGetCurrentUser.mockResolvedValue(user);
    const result = await setStoryJourneyPlaceAction(STORY_A, bad);
    expect(result.ok).toBe(false);
    expect(mockSetStoryJourneyPlace).not.toHaveBeenCalled();
    expect(mockLogAppEvent).not.toHaveBeenCalled();
  });

  it.each([
    ["WHV11", "That story wasn't found, or it isn't yours."],
    ["WHV15", "Only published stories can be pinned on your journey map."],
    ["WHV17", "Only New Zealand stories can be pinned on your journey map."],
    ["WHV18", "Give this place a name and choose a spot inside New Zealand."],
  ])("maps %s to its translated message", async (code, message) => {
    mockGetCurrentUser.mockResolvedValue(user);
    mockSetStoryJourneyPlace.mockRejectedValue({ code, message: "x" });

    const result = await setStoryJourneyPlaceAction(STORY_A, place);

    expect(result).toEqual({ ok: false, error: message });
    expect(mockInvalidateStoryPublicCache).not.toHaveBeenCalled();
    expect(mockLogAppEvent).not.toHaveBeenCalled();
  });
});

describe("resolveGoogleMapsLinkAction", () => {
  const fullLink =
    "https://www.google.com/maps/place/Taupo/@-38.68,176.07,12z/data=!8m2!3d-38.6857!4d176.0702";

  it("refuses a signed-out caller without any outbound request", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const fetchFn = vi.fn();
    vi.stubGlobal("fetch", fetchFn);
    expect(
      await resolveGoogleMapsLinkAction("https://maps.app.goo.gl/a"),
    ).toEqual({ ok: false, reason: "unauthenticated" });
    expect(fetchFn).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("rejects non-strings and over-long input", async () => {
    mockGetCurrentUser.mockResolvedValue(user);
    expect(await resolveGoogleMapsLinkAction(42)).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(
      await resolveGoogleMapsLinkAction(
        "https://goo.gl/maps/" + "a".repeat(2100),
      ),
    ).toEqual({ ok: false, reason: "invalid" });
  });

  it("resolves a full link for a signed-in user", async () => {
    mockGetCurrentUser.mockResolvedValue(user);
    expect(await resolveGoogleMapsLinkAction(fullLink)).toEqual({
      ok: true,
      latitude: -38.6857,
      longitude: 176.0702,
      placeName: "Taupo",
    });
  });
});
