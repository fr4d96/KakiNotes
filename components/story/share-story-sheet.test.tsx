import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ShareStorySheet } from "./share-story-sheet";

const showToast = vi.fn();
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ showToast }) }));

const base = {
  open: true,
  onClose: vi.fn(),
  title: "Queenstown & Beyond",
  subtitle: "Mun · Otago",
  path: "/stories/queenstown-beyond",
  coverUrl: "https://cdn.test/cover.jpg",
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  // @ts-expect-error test cleanup
  delete navigator.share;
});

const url = () => `${window.location.origin}/stories/queenstown-beyond`;

describe("ShareStorySheet", () => {
  it("is a labelled modal dialog with the preview card", () => {
    render(<ShareStorySheet {...base} />);
    const dialog = screen.getByRole("dialog", { name: "Share" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("Queenstown & Beyond")).toBeInTheDocument();
    expect(screen.getByText("Mun · Otago")).toBeInTheDocument();
    expect(dialog.querySelector("img")?.getAttribute("src")).toBe(
      "https://cdn.test/cover.jpg",
    );
  });

  it("closes from the close button", () => {
    render(<ShareStorySheet {...base} />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(base.onClose).toHaveBeenCalled();
  });

  it("falls back to the placeholder with no cover, and never an embed option", () => {
    render(<ShareStorySheet {...base} coverUrl={null} />);
    expect(screen.queryByText(/embed/i)).toBeNull();
    expect(document.querySelector('img[src*="cdn.test"]')).toBeNull();
  });

  it("copies the canonical link and confirms", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<ShareStorySheet {...base} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await screen.findByText("Link copied");
    expect(writeText).toHaveBeenCalledWith(url());
    expect(showToast).toHaveBeenCalledWith("Link copied");
  });

  it("builds the WhatsApp and email links", () => {
    render(<ShareStorySheet {...base} />);
    const wa = screen.getByRole("link", { name: "WhatsApp" });
    expect(wa).toHaveAttribute(
      "href",
      `https://wa.me/?text=${encodeURIComponent(`Queenstown & Beyond ${url()}`)}`,
    );
    const mail = screen.getByRole("link", { name: "Email" });
    expect(mail).toHaveAttribute(
      "href",
      `mailto:?subject=${encodeURIComponent("Queenstown & Beyond")}&body=${encodeURIComponent(url())}`,
    );
  });

  it("shows More only when the browser can share, and shares title + url", () => {
    const { unmount } = render(<ShareStorySheet {...base} />);
    expect(screen.queryByRole("button", { name: "More" })).toBeNull();
    unmount();

    const share = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { share });
    render(<ShareStorySheet {...base} />);
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    expect(share).toHaveBeenCalledWith({
      title: "Queenstown & Beyond",
      url: url(),
    });
  });
});
