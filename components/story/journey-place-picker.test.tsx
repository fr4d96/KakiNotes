import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { JourneyPlacePicker, capPlaceName } from "./journey-place-picker";

vi.mock("@/app/(contributor)/my-stories/journey/actions", () => ({
  resolveGoogleMapsLinkAction: vi.fn(),
}));

describe("capPlaceName", () => {
  it("trims and caps at 60 characters without splitting a surrogate pair", () => {
    expect(capPlaceName("  Cromwell ")).toBe("Cromwell");
    expect(capPlaceName("x".repeat(59) + "😀")).toBe("x".repeat(59));
    expect(capPlaceName("x".repeat(80))).toHaveLength(60);
  });
});

describe("JourneyPlacePicker", () => {
  it("has no pin until a place is chosen", () => {
    render(<JourneyPlacePicker value={null} onChange={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Chosen place" })).toBeNull();
  });

  it("chooses the middle of the map with the keyboard-friendly button", () => {
    const onChange = vi.fn();
    render(<JourneyPlacePicker value={null} onChange={onChange} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Choose the middle of the map" }),
    );
    const [point] = onChange.mock.calls[0];
    expect(point.latitude).toBeLessThan(-34);
    expect(point.latitude).toBeGreaterThan(-47.5);
    expect(point.longitude).toBeGreaterThan(166);
    expect(point.longitude).toBeLessThan(178.9);
  });

  it("nudges a focused pin with the arrow keys, staying inside New Zealand", () => {
    const onChange = vi.fn();
    render(
      <JourneyPlacePicker
        value={{ latitude: -34.1, longitude: 174 }}
        onChange={onChange}
      />,
    );
    const pin = screen.getByRole("button", { name: "Chosen place" });
    fireEvent.keyDown(pin, { key: "ArrowUp" });
    expect(onChange).toHaveBeenLastCalledWith({
      latitude: -34,
      longitude: 174,
    });
    fireEvent.keyDown(pin, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith({
      latitude: -34.1,
      longitude: 174.25,
    });
  });

  it("uses a pasted full Google Maps link and hands back its place name", async () => {
    const onChange = vi.fn();
    const resolveLink = vi.fn();
    render(
      <JourneyPlacePicker
        value={null}
        onChange={onChange}
        resolveLink={resolveLink}
      />,
    );
    fireEvent.change(screen.getByLabelText("Or use a Google Maps link"), {
      target: {
        value:
          "https://www.google.com/maps/place/Taupo/@-38.68,176.07,12z/data=!8m2!3d-38.6857!4d176.0702",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Use link" }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange).toHaveBeenCalledWith(
      { latitude: -38.6857, longitude: 176.0702 },
      "Taupo",
    );
    expect(resolveLink).not.toHaveBeenCalled();
  });

  it("rejects a link outside New Zealand and an empty link", async () => {
    const onChange = vi.fn();
    render(<JourneyPlacePicker value={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Use link" }));
    expect(
      await screen.findByText("Paste a Google Maps link first."),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Or use a Google Maps link"), {
      target: {
        value:
          "https://www.google.com/maps/place/Sydney/@-33.87,151.21,12z/data=!8m2!3d-33.8688!4d151.2093",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Use link" }));
    expect(
      await screen.findByText("That place is outside New Zealand."),
    ).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });
});
