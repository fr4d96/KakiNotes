import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TouchActive } from "./touch-active";

describe("TouchActive", () => {
  it("registers one passive touchstart listener on document and removes it", () => {
    const add = vi.spyOn(document, "addEventListener");
    const remove = vi.spyOn(document, "removeEventListener");

    const { container, unmount } = render(<TouchActive />);
    expect(container).toBeEmptyDOMElement();

    const call = add.mock.calls.find(([type]) => type === "touchstart");
    expect(call?.[2]).toEqual({ passive: true });

    unmount();
    expect(remove.mock.calls.some(([type]) => type === "touchstart")).toBe(
      true,
    );
    add.mockRestore();
    remove.mockRestore();
  });
});
