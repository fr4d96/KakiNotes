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
// on the page, via buttons, arrow keys, and horizontal swipes.

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

  it("wraps around with the next and previous buttons", async () => {
    const user = userEvent.setup();
    render(<ThreePhotos />);
    await user.click(screen.getByRole("button", { name: /Photo one/i }));
    expect(screen.getByText("Photo 1 of 3")).toBeInTheDocument();

    const next = screen.getByRole("button", { name: "Next photo" });
    await user.click(next);
    expect(screen.getByText("Photo 2 of 3")).toBeInTheDocument();
    await user.click(next);
    expect(screen.getByText("Photo 3 of 3")).toBeInTheDocument();
    await user.click(next);
    expect(screen.getByText("Photo 1 of 3")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Previous photo" }));
    expect(screen.getByText("Photo 3 of 3")).toBeInTheDocument();
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

  it("advances on a left swipe past the threshold, and ignores a short drag", async () => {
    const user = userEvent.setup();
    render(<ThreePhotos />);
    await user.click(screen.getByRole("button", { name: /Photo one/i }));
    const dialog = getDialog();

    fireEvent.pointerDown(dialog, { clientX: 300 });
    fireEvent.pointerUp(dialog, { clientX: 280 });
    expect(screen.getByText("Photo 1 of 3")).toBeInTheDocument();

    fireEvent.pointerDown(dialog, { clientX: 300 });
    fireEvent.pointerUp(dialog, { clientX: 100 });
    expect(screen.getByText("Photo 2 of 3")).toBeInTheDocument();
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
