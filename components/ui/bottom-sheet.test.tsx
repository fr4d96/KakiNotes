import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { BottomSheet } from "./bottom-sheet";

function sheet(overrides: Partial<React.ComponentProps<typeof BottomSheet>>) {
  return (
    <BottomSheet open onClose={vi.fn()} title="Filters" {...overrides}>
      <p>sheet body</p>
    </BottomSheet>
  );
}

afterEach(() => {
  cleanup();
  document.documentElement.style.overflow = "";
  document.body.style.overflow = "";
});

describe("BottomSheet", () => {
  it("is a labelled modal dialog named by its title", () => {
    render(sheet({}));
    const dialog = screen.getByRole("dialog", { name: "Filters" });
    expect(dialog).toHaveAttribute("open");
    expect(
      screen.getByRole("heading", { name: "Filters" }),
    ).toBeInTheDocument();
  });

  it("stays closed, and mounts no children, until opened", () => {
    const { rerender } = render(sheet({ open: false }));
    expect(screen.queryByText("sheet body")).toBeNull();
    expect(document.querySelector("dialog")).not.toHaveAttribute("open");

    rerender(sheet({ open: true }));
    expect(screen.getByText("sheet body")).toBeInTheDocument();
    expect(document.querySelector("dialog")).toHaveAttribute("open");
  });

  it("keeps children mounted while closed when keepMounted is set", () => {
    // The filter sheet's fields must still submit with the form.
    render(sheet({ open: false, keepMounted: true }));
    expect(screen.getByText("sheet body")).toBeInTheDocument();
  });

  it("closes from the visible, translated close button", () => {
    const onClose = vi.fn();
    render(sheet({ onClose }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes when the backdrop (the dialog element itself) is clicked, not its content", () => {
    const onClose = vi.fn();
    render(sheet({ onClose }));
    fireEvent.click(screen.getByText("sheet body"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("reports the native close event (Escape) to the caller", () => {
    const onClose = vi.fn();
    render(sheet({ onClose }));
    fireEvent(screen.getByRole("dialog"), new Event("close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("renders a pinned footer", () => {
    render(sheet({ footer: <button type="submit">Apply</button> }));
    expect(screen.getByRole("button", { name: "Apply" })).toBeInTheDocument();
  });

  it("locks background scroll while open and restores it on close", () => {
    const { rerender } = render(sheet({}));
    expect(document.documentElement.style.overflow).toBe("hidden");
    rerender(sheet({ open: false }));
    expect(document.documentElement.style.overflow).toBe("");
  });

  it("reserves the home-indicator inset and caps its height", () => {
    render(sheet({}));
    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("max-h-[85dvh]");
    expect(dialog.firstElementChild?.className).toContain(
      "pb-[env(safe-area-inset-bottom)]",
    );
    // Reduced motion: no transition at all.
    expect(dialog.className).toContain("motion-reduce:transition-none");
  });

  describe("drag to dismiss", () => {
    function setup() {
      const onClose = vi.fn();
      render(sheet({ onClose }));
      const dialog = screen.getByRole("dialog") as HTMLDialogElement;
      Object.defineProperty(dialog, "offsetHeight", {
        value: 400,
        configurable: true,
      });
      // The drag surface is the header that holds the title.
      const header = screen.getByRole("heading", { name: "Filters" })
        .parentElement!.parentElement!;
      return { onClose, dialog, header };
    }

    // The sheet times the gesture with performance.now(), so the helper
    // steps a fake clock alongside each pointer event.
    function drag(header: HTMLElement, moves: Array<{ y: number; t: number }>) {
      const clock = vi.spyOn(performance, "now");
      const at = (t: number) => clock.mockReturnValue(t);
      const [first, ...rest] = moves;
      at(first.t);
      fireEvent.pointerDown(header, { clientY: first.y, pointerId: 1 });
      for (const move of rest) {
        at(move.t);
        fireEvent.pointerMove(header, { clientY: move.y, pointerId: 1 });
      }
      const last = rest[rest.length - 1];
      fireEvent.pointerUp(header, { clientY: last.y, pointerId: 1 });
      clock.mockRestore();
    }

    it("follows the finger downward", () => {
      const { dialog, header } = setup();
      fireEvent.pointerDown(header, { clientY: 100, pointerId: 1 });
      fireEvent.pointerMove(header, { clientY: 160, pointerId: 1 });
      expect(dialog.style.transform).toBe("translateY(60px)");
      expect(dialog.style.transition).toBe("none");
    });

    it("never moves above its resting position", () => {
      const { dialog, header } = setup();
      fireEvent.pointerDown(header, { clientY: 100, pointerId: 1 });
      fireEvent.pointerMove(header, { clientY: 40, pointerId: 1 });
      expect(dialog.style.transform).toBe("");
    });

    it("dismisses when released past a quarter of the height", () => {
      const { onClose, header } = setup();
      // 150px of 400 = 37%, released slowly.
      drag(header, [
        { y: 100, t: 0 },
        { y: 250, t: 1500 },
      ]);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("dismisses on a short, fast flick", () => {
      const { onClose, header } = setup();
      // 60px (15%) in 40ms = 1.5 px/ms.
      drag(header, [
        { y: 100, t: 0 },
        { y: 130, t: 20 },
        { y: 160, t: 40 },
      ]);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("springs back when released early and slowly", () => {
      const { onClose, dialog, header } = setup();
      // 40px (10%) over a second.
      drag(header, [
        { y: 100, t: 0 },
        { y: 140, t: 1000 },
      ]);
      expect(onClose).not.toHaveBeenCalled();
      expect(dialog.style.transform).toBe("");
      expect(dialog.style.transition).toBe("");
    });

    it("springs back when the gesture is cancelled", () => {
      const { onClose, dialog, header } = setup();
      fireEvent.pointerDown(header, { clientY: 100, pointerId: 1 });
      fireEvent.pointerMove(header, { clientY: 300, pointerId: 1 });
      fireEvent.pointerCancel(header, { clientY: 300, pointerId: 1 });
      expect(onClose).not.toHaveBeenCalled();
      expect(dialog.style.transform).toBe("");
    });

    it("does not start a drag from the close button", () => {
      const { dialog } = setup();
      const close = screen.getByRole("button", { name: "Close" });
      fireEvent.pointerDown(close, { clientY: 100, pointerId: 1 });
      fireEvent.pointerMove(close, { clientY: 300, pointerId: 1 });
      expect(dialog.style.transform).toBe("");
    });
  });
});
