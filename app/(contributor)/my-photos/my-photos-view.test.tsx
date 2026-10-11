import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MyPhotoStory } from "@/lib/story/my-photos";

const getPhotoDownloadUrlAction = vi.hoisted(() => vi.fn());
vi.mock("@/app/(contributor)/my-photos/actions", () => ({
  getPhotoDownloadUrlAction,
}));
vi.mock("@/app/(contributor)/stories/[id]/media-actions", () => ({
  mintPreviewUrlAction: vi.fn(async () => ({ error: "no preview" })),
}));

import { MyPhotosView } from "@/app/(contributor)/my-photos/my-photos-view";

const KAKI = "11111111-1111-4111-8111-111111111111";
const DRIVE = "22222222-2222-4222-8222-222222222222";

const stories: MyPhotoStory[] = [
  {
    storyId: "s1",
    title: "Kiwi orchard summer",
    lifecycleStatus: "published",
    photos: [
      {
        mediaId: KAKI,
        storageBackend: "supabase",
        altText: "Kiwifruit on a vine",
        caption: null,
        width: 1500,
        height: 2000,
        inCurrentVersion: true,
        thumbnailUrl: "https://example.test/kaki.jpg",
      },
      {
        mediaId: DRIVE,
        storageBackend: "google_drive",
        altText: null,
        caption: null,
        width: 1500,
        height: 2000,
        inCurrentVersion: false,
        thumbnailUrl: null,
      },
    ],
  },
];

beforeEach(() => getPhotoDownloadUrlAction.mockReset());

describe("MyPhotosView", () => {
  it("groups photos under their story with its status, and says where each one lives", () => {
    render(<MyPhotosView stories={stories} driveConnected={true} />);
    expect(
      screen.getByRole("heading", { name: "Kiwi orchard summer" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Published")).toBeInTheDocument();
    expect(screen.getByText("On Kakinotes")).toBeInTheDocument();
    expect(screen.getByText(/In your Google Drive/)).toBeInTheDocument();
    expect(screen.getByText(/from an earlier version/)).toBeInTheDocument();
    expect(screen.getByText("2 photos across 1 story.")).toBeInTheDocument();
  });

  it("gives every photo its own labelled Download button", () => {
    render(<MyPhotosView stories={stories} driveConnected={true} />);
    expect(
      screen.getByRole("button", {
        name: "Download photo 1 of Kiwi orchard summer",
      }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", {
        name: "Download photo 2 of Kiwi orchard summer",
      }),
    ).toBeEnabled();
  });

  it("downloads by following the URL the server returns, without leaving the page", async () => {
    getPhotoDownloadUrlAction.mockResolvedValue({
      url: "https://example.test/signed?download=kakinotes-photo-11111111.jpg",
    });
    const clicked: string[] = [];
    const spy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        clicked.push(this.href);
      });

    render(<MyPhotosView stories={stories} driveConnected={true} />);
    await userEvent.click(
      screen.getByRole("button", {
        name: "Download photo 1 of Kiwi orchard summer",
      }),
    );

    await waitFor(() => expect(clicked).toHaveLength(1));
    expect(getPhotoDownloadUrlAction).toHaveBeenCalledWith(KAKI);
    expect(clicked[0]).toContain("download=kakinotes-photo-11111111.jpg");
    spy.mockRestore();
  });

  it("shows the server's error next to the photo when a download can't start", async () => {
    getPhotoDownloadUrlAction.mockResolvedValue({ error: "Not allowed." });
    render(<MyPhotosView stories={stories} driveConnected={true} />);
    await userEvent.click(
      screen.getByRole("button", {
        name: "Download photo 1 of Kiwi orchard summer",
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Not allowed.");
  });

  it("asks to reconnect, instead of offering a download that would fail, when Drive is disconnected", () => {
    render(<MyPhotosView stories={stories} driveConnected={false} />);
    expect(
      screen.getByText("Reconnect Google Drive to see this photo."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Reconnect Google Drive" }),
    ).toHaveAttribute("href", "/account#drive");
    expect(
      screen.queryByRole("button", {
        name: "Download photo 2 of Kiwi orchard summer",
      }),
    ).toBeNull();
    // The Kakinotes photo is unaffected.
    expect(
      screen.getByRole("button", {
        name: "Download photo 1 of Kiwi orchard summer",
      }),
    ).toBeEnabled();
  });

  it("has a friendly empty state", () => {
    render(<MyPhotosView stories={[]} driveConnected={false} />);
    expect(screen.getByText(/No photos yet/)).toBeInTheDocument();
  });
});
