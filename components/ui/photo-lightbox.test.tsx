import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import {
  LightboxPhoto,
  PhotoLightboxProvider,
} from "@/components/ui/photo-lightbox";

// Regression coverage for the site-wide photo viewer: a single <dialog>
// owned by the provider, paged through by every LightboxPhoto registered
// on the page, via buttons, arrow keys and a native swipe track, and closed
// by the close button, Escape or a drag down. (The zoom in/out uses
// Element.animate, which jsdom lacks, so here it closes immediately.)

function ThreePhotos({ children }: { children?: ReactNode }) {
  return (
    <PhotoLightboxProvider>
      <LightboxPhoto url="https://example.com/1.jpg" alt="Photo one">
        <img src="https://example.com/1.jpg" alt="Photo one" />
      </LightboxPhoto>
      <LightboxPhoto url="https://example.com/2.jpg" alt="Photo two">
        <img src="https://example.com/2.jpg" alt="Photo two" />
      </LightboxPhoto>
      <LightboxPhoto
        url="https://example.com/3.jpg"
        alt="Photo three"
        caption="Third caption"
      >
        <img src="https://example.com/3.jpg" alt="Photo three" />
      </LightboxPhoto>
      {children}
    </PhotoLightboxProvider>
  );
}

function getDialog() {
  return document.querySelector("dialog")!;
}

describe("PhotoLightboxProvider / LightboxPhoto", () => {
  it("renders the child img with no wrapping button when there is no provider", () => {
    render(
      <LightboxPhoto url="https://example.com/a.jpg" alt="A photo">
        <img src="https://example.com/a.jpg" alt="A photo" />
      </LightboxPhoto>,
    );

    expect(screen.getByAltText("A photo")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("opens the dialog at the clicked photo", async () => {
    const user = userEvent.setup();
    render(<ThreePhotos />);

    await user.click(screen.getByRole("button", { name: /Photo two/i }));

    const dialog = getDialog();
    expect(dialog).toHaveAttribute("open");
    expect(screen.getByText("Photo 2 of 3")).toBeInTheDocument();
    expect(within(dialog).getByRole("img")).toHaveAttribute(
      "src",
      "https://example.com/2.jpg",
    );
  });

  it("moves with the next and previous buttons, stopping at the ends", async () => {
    const user = userEvent.setup();
    render(<ThreePhotos />);
    await user.click(screen.getByRole("button", { name: /Photo one/i }));
    expect(screen.getByText("Photo 1 of 3")).toBeInTheDocument();
    // Like the Photos app: nothing before the first photo.
    expect(
      screen.queryByRole("button", { name: "Previous photo" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next photo" }));
    expect(screen.getByText("Photo 2 of 3")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next photo" }));
    expect(screen.getByText("Photo 3 of 3")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Next photo" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Previous photo" }));
    expect(screen.getByText("Photo 2 of 3")).toBeInTheDocument();
  });

  it("pages through photos with the arrow keys on the dialog", async () => {
    const user = userEvent.setup();
    render(<ThreePhotos />);
    await user.click(screen.getByRole("button", { name: /Photo one/i }));
    const dialog = getDialog();

    fireEvent.keyDown(dialog, { key: "ArrowRight" });
    expect(screen.getByText("Photo 2 of 3")).toBeInTheDocument();

    fireEvent.keyDown(dialog, { key: "ArrowLeft" });
    expect(screen.getByText("Photo 1 of 3")).toBeInTheDocument();
  });

  it("lays every photo on one swipe track, exposing only the current one", async () => {
    const user = userEvent.setup();
    render(<ThreePhotos />);
    await user.click(screen.getByRole("button", { name: /Photo two/i }));
    const dialog = getDialog();

    const slides = dialog.querySelectorAll("figure");
    expect(slides).toHaveLength(3);
    const track = slides[0].parentElement!;
    // Native, finger-following swipe with snap; vertical drags are left
    // to the pointer handlers (drag down to close).
    expect(track).toHaveClass(
      "snap-x",
      "snap-mandatory",
      "overflow-x-auto",
      "touch-pan-x",
    );
    for (const slide of slides) expect(slide).toHaveClass("snap-center");
    expect(slides[0]).toHaveAttribute("aria-hidden", "true");
    expect(slides[1]).not.toHaveAttribute("aria-hidden");
    expect(within(dialog).getAllByRole("img")).toHaveLength(1);
  });

  it("closes on a long drag down, and springs back from a short one", async () => {
    const user = userEvent.setup();
    render(<ThreePhotos />);
    await user.click(screen.getByRole("button", { name: /Photo one/i }));
    const dialog = getDialog();
    const track = dialog.querySelector("figure")!.parentElement!;
    // isPrimary: jsdom's PointerEvent defaults it to false; a real finger or
    // mouse is primary, and the viewer ignores secondary pointers.
    const drag = (to: number) => {
      fireEvent.pointerDown(track, {
        pointerId: 1,
        isPrimary: true,
        clientX: 200,
        clientY: 300,
      });
      fireEvent.pointerMove(track, {
        pointerId: 1,
        isPrimary: true,
        clientX: 202,
        clientY: 320,
      });
      fireEvent.pointerMove(track, {
        pointerId: 1,
        isPrimary: true,
        clientX: 204,
        clientY: to,
      });
      fireEvent.pointerUp(track, {
        pointerId: 1,
        isPrimary: true,
        clientX: 204,
        clientY: to,
      });
    };

    drag(360); // 60px: not far enough
    expect(dialog).toHaveAttribute("open");

    drag(520); // 220px: dismiss
    expect(dialog).not.toHaveAttribute("open");
  });

  it("ignores a sideways drag (that is the track's swipe, not a dismiss)", async () => {
    const user = userEvent.setup();
    render(<ThreePhotos />);
    await user.click(screen.getByRole("button", { name: /Photo one/i }));
    const dialog = getDialog();
    const track = dialog.querySelector("figure")!.parentElement!;

    fireEvent.pointerDown(track, {
      pointerId: 1,
      isPrimary: true,
      clientX: 300,
      clientY: 300,
    });
    fireEvent.pointerMove(track, {
      pointerId: 1,
      isPrimary: true,
      clientX: 100,
      clientY: 330,
    });
    fireEvent.pointerMove(track, {
      pointerId: 1,
      isPrimary: true,
      clientX: 40,
      clientY: 480,
    });
    fireEvent.pointerUp(track, {
      pointerId: 1,
      isPrimary: true,
      clientX: 40,
      clientY: 480,
    });
    expect(dialog).toHaveAttribute("open");
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    render(<ThreePhotos />);
    await user.click(screen.getByRole("button", { name: /Photo one/i }));
    const dialog = getDialog();
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    expect(dialog).not.toHaveAttribute("open");
  });

  it("shows no prev/next buttons or counter with a single photo", async () => {
    const user = userEvent.setup();
    render(
      <PhotoLightboxProvider>
        <LightboxPhoto url="https://example.com/only.jpg" alt="Only photo">
          <img src="https://example.com/only.jpg" alt="Only photo" />
        </LightboxPhoto>
      </PhotoLightboxProvider>,
    );

    await user.click(screen.getByRole("button", { name: /Only photo/i }));

    expect(
      screen.queryByRole("button", { name: "Next photo" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Previous photo" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/of 1/)).not.toBeInTheDocument();
  });

  it("closes the dialog with the close button", async () => {
    const user = userEvent.setup();
    render(<ThreePhotos />);
    await user.click(screen.getByRole("button", { name: /Photo one/i }));
    const dialog = getDialog();
    expect(dialog).toHaveAttribute("open");

    await user.click(
      screen.getByRole("button", { name: "Close photo viewer" }),
    );
    expect(dialog).not.toHaveAttribute("open");
  });

  it("renders a caption as a figcaption", async () => {
    const user = userEvent.setup();
    render(<ThreePhotos />);
    await user.click(screen.getByRole("button", { name: /Photo three/i }));

    const caption = within(getDialog()).getByText("Third caption");
    expect(caption.tagName).toBe("FIGCAPTION");
  });
});
