import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@/app/(contributor)/account/drive/actions", () => ({
  disconnectDriveAction: vi.fn(async () => ({})),
}));
vi.mock("@/app/(contributor)/account/drive/move-actions", () => ({
  startDriveMoveAction: vi.fn(),
  moveNextDrivePhotoAction: vi.fn(),
  finishDriveMoveAction: vi.fn(),
}));

import { DriveTab } from "@/app/(contributor)/account/drive-tab";

describe("DriveTab", () => {
  it("shows the not-available message when Drive isn't configured here", () => {
    render(
      <DriveTab
        configured={false}
        connection={{
          connected: false,
          googleAccountEmail: null,
          connectedAt: null,
        }}
        resultStatus={null}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(/isn.t available/i);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows a Connect link and explainer when not connected", () => {
    render(
      <DriveTab
        configured={true}
        connection={{
          connected: false,
          googleAccountEmail: null,
          connectedAt: null,
        }}
        resultStatus={null}
      />,
    );
    const link = screen.getByRole("link", { name: /connect google drive/i });
    expect(link).toHaveAttribute("href", "/account/drive/connect");
  });

  it("shows the connected state with email, connected date, and a disabled Disconnect until confirmed", () => {
    render(
      <DriveTab
        configured={true}
        connection={{
          connected: true,
          googleAccountEmail: "person@example.com",
          connectedAt: "2026-01-01T00:00:00.000Z",
        }}
        resultStatus={null}
      />,
    );
    expect(screen.getByText(/person@example\.com/)).toBeInTheDocument();
    const disconnectButton = screen.getByRole("button", {
      name: /disconnect google drive/i,
    });
    expect(disconnectButton).toBeDisabled();

    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);
    expect(disconnectButton).toBeEnabled();
  });

  it("shows the connected result banner", () => {
    render(
      <DriveTab
        configured={true}
        connection={{
          connected: false,
          googleAccountEmail: null,
          connectedAt: null,
        }}
        resultStatus="connected"
      />,
    );
    expect(screen.getByText(/drive connected/i)).toBeInTheDocument();
  });

  it("shows the cancelled result banner", () => {
    render(
      <DriveTab
        configured={true}
        connection={{
          connected: false,
          googleAccountEmail: null,
          connectedAt: null,
        }}
        resultStatus="cancelled"
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(/didn't finish/i);
  });

  it("shows the failed result banner as an alert", () => {
    render(
      <DriveTab
        configured={true}
        connection={{
          connected: false,
          googleAccountEmail: null,
          connectedAt: null,
        }}
        resultStatus="failed"
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/went wrong/i);
  });
});
