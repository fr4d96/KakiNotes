// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PdfImportPicker } from "./pdf-import-picker";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const PREVIEW_RESPONSE = {
  pageCount: 1,
  pages: [
    {
      pageNumber: 1,
      width: 100,
      height: 140,
      dataUrl: "data:image/png;base64,AAA",
    },
  ],
};

function pdfFile(name = "trip.pdf") {
  const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 1, 2, 3]);
  return new File([bytes], name, { type: "application/pdf" });
}

function renderPicker(countrySlug = "new-zealand") {
  return render(<PdfImportPicker countrySlug={countrySlug} />);
}

beforeEach(() => {
  push.mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url === "/stories/new/pdf-preview") {
        return new Response(JSON.stringify(PREVIEW_RESPONSE), {
          status: 200,
        });
      }
      if (url === "/stories/new/pdf-attach") {
        return new Response(
          JSON.stringify({
            storyId: "story-1",
            revisionId: "revision-1",
            attachedCount: 1,
            duplicatePages: [],
          }),
          { status: 200 },
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }),
  );
});

describe("PdfImportPicker (contributor)", () => {
  it("sends the countrySlug prop as a `country` form field on submit", async () => {
    const user = userEvent.setup();
    renderPicker("china");

    await user.type(screen.getByLabelText("Title"), "My Trip");
    const input = screen.getByLabelText("PDF file") as HTMLInputElement;
    await user.upload(input, pdfFile());
    await user.click(
      screen.getByRole("button", { name: "Upload & preview pages" }),
    );
    await waitFor(() =>
      expect(screen.getByText("Select pages to attach")).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: "Page 1" }));
    await user.type(
      screen.getByLabelText("Alt text for page 1 (required)"),
      "Cover page",
    );

    await user.click(screen.getByRole("button", { name: "Create My Story" }));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/stories/story-1/edit"),
    );

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const attachCall = fetchMock.mock.calls.find(
      ([url]) => url === "/stories/new/pdf-attach",
    );
    expect(attachCall).toBeTruthy();
    const body = attachCall![1].body as FormData;
    expect(body.get("country")).toBe("china");
  });

  it("defaults to new-zealand when rendered with the default countrySlug", async () => {
    const user = userEvent.setup();
    renderPicker("new-zealand");

    await user.type(screen.getByLabelText("Title"), "My Trip");
    const input = screen.getByLabelText("PDF file") as HTMLInputElement;
    await user.upload(input, pdfFile());
    await user.click(
      screen.getByRole("button", { name: "Upload & preview pages" }),
    );
    await waitFor(() =>
      expect(screen.getByText("Select pages to attach")).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: "Page 1" }));
    await user.type(
      screen.getByLabelText("Alt text for page 1 (required)"),
      "Cover page",
    );
    await user.click(screen.getByRole("button", { name: "Create My Story" }));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/stories/story-1/edit"),
    );

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const attachCall = fetchMock.mock.calls.find(
      ([url]) => url === "/stories/new/pdf-attach",
    );
    const body = attachCall![1].body as FormData;
    expect(body.get("country")).toBe("new-zealand");
  });
});
