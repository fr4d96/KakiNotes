import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConfirmDialog } from "./confirm-dialog";

// The small centered modals (ConfirmDialog here; AuthModal and the desktop
// share dialog use the same hook) animate with element.animate(), so they
// also animate on iPhone, where the old CSS-only version could not.
type FakeAnim = {
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
  onfinish: (() => void) | null;
  cancel: () => void;
};
let anims: FakeAnim[] = [];

function installAnimate() {
  anims = [];
  Object.defineProperty(HTMLElement.prototype, "animate", {
    configurable: true,
    value(keyframes: Keyframe[], options: KeyframeAnimationOptions) {
      const anim: FakeAnim = {
        keyframes,
        options,
        onfinish: null,
        cancel: vi.fn(),
      };
      anims.push(anim);
      return anim;
    },
  });
}

afterEach(() => {
  delete (HTMLElement.prototype as { animate?: unknown }).animate;
});

function confirm(open: boolean, onCancel = vi.fn()) {
  return (
    <ConfirmDialog
      open={open}
      title="Delete this photo?"
      onConfirm={() => {}}
      onCancel={onCancel}
    />
  );
}

describe("dialog motion — ConfirmDialog", () => {
  it("fades and grows in when it opens", () => {
    installAnimate();
    render(confirm(true));
    const pop = anims.find((a) => !a.options.pseudoElement)!;
    expect(pop.keyframes[0]).toMatchObject({ opacity: 0 });
    expect(pop.keyframes[1]).toMatchObject({ opacity: 1, transform: "none" });
  });

  it("stays on screen until its exit animation finishes", () => {
    installAnimate();
    const { rerender } = render(confirm(true));
    const dialog = screen.getByRole("dialog", {
      hidden: true,
    }) as HTMLDialogElement;
    anims = [];

    rerender(confirm(false));
    const pop = anims.find((a) => !a.options.pseudoElement)!;
    expect(pop.keyframes[1]).toMatchObject({ opacity: 0 });
    expect(dialog.open).toBe(true);

    pop.onfinish!();
    expect(dialog.open).toBe(false);
  });

  it("routes Escape through onCancel so the exit can animate", () => {
    installAnimate();
    const onCancel = vi.fn();
    render(confirm(true, onCancel));
    const dialog = screen.getByRole("dialog", { hidden: true });
    const escape = new Event("cancel", { cancelable: true });
    dialog.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("opens and closes instantly without animate() (reduced motion, old engines)", () => {
    const { rerender } = render(confirm(true));
    const dialog = screen.getByRole("dialog", {
      hidden: true,
    }) as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    rerender(confirm(false));
    expect(dialog.open).toBe(false);
  });
});
