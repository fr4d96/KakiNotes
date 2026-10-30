import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClickPulse, pulseTarget } from "./click-pulse";

// jsdom has no Web Animations API.
const animate = vi.fn(() => ({ cancel: vi.fn() }));

beforeEach(() => {
  animate.mockClear();
  Object.defineProperty(HTMLElement.prototype, "animate", {
    configurable: true,
    value: animate,
  });
});

afterEach(() => {
  delete (HTMLElement.prototype as { animate?: unknown }).animate;
});

describe("ClickPulse", () => {
  it("pulses a clicked button, including a click on its icon", async () => {
    const user = userEvent.setup();
    render(
      <>
        <ClickPulse />
        <button type="button">
          <span data-testid="icon">*</span> Save
        </button>
      </>,
    );
    await user.click(screen.getByTestId("icon"));
    expect(animate).toHaveBeenCalledTimes(1);
    expect(animate.mock.contexts[0]).toBe(
      screen.getByRole("button", { name: /save/i }),
    );
  });

  it("leaves plain text and opted-out controls alone", async () => {
    const user = userEvent.setup();
    render(
      <>
        <ClickPulse />
        <p>Just text</p>
        <div data-no-pulse>
          <button type="button">Quiet</button>
        </div>
      </>,
    );
    await user.click(screen.getByText("Just text"));
    await user.click(screen.getByRole("button", { name: "Quiet" }));
    expect(animate).not.toHaveBeenCalled();
  });

  it("removes its listener on unmount", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<ClickPulse />);
    unmount();
    render(<button type="button">Later</button>);
    await user.click(screen.getByRole("button", { name: "Later" }));
    expect(animate).not.toHaveBeenCalled();
  });
});

describe("pulseTarget", () => {
  it("skips cards and photos taller than a control", () => {
    const button = document.createElement("button");
    vi.spyOn(button, "getBoundingClientRect").mockReturnValue({
      height: 300,
    } as DOMRect);
    document.body.append(button);
    expect(pulseTarget(button)).toBeNull();
    button.remove();
  });

  it("skips disabled controls and big press-hover-only surfaces", () => {
    const disabled = document.createElement("button");
    disabled.disabled = true;
    const card = document.createElement("div");
    card.className = "press press-hover-only";
    document.body.append(disabled, card);
    expect(pulseTarget(disabled)).toBeNull();
    expect(pulseTarget(card)).toBeNull();
    disabled.remove();
    card.remove();
  });
});
