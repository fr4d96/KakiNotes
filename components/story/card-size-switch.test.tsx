import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { CardSizeSwitch } from "./card-size-switch";

describe("CardSizeSwitch", () => {
  it("remembers small cards on this device and redraws the list", async () => {
    const user = userEvent.setup();
    render(<CardSizeSwitch size="big" />);

    const big = screen.getByRole("button", { name: "Big cards" });
    const small = screen.getByRole("button", { name: "Small cards" });
    expect(big).toHaveAttribute("aria-pressed", "true");

    await user.click(small);

    expect(small).toHaveAttribute("aria-pressed", "true");
    expect(document.cookie).toContain("kakinotes-card-size=small");
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
