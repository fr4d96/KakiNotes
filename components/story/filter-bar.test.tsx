import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FilterBar } from "./filter-bar";

const regions = [{ id: "r1", name: "Hawke's Bay" }];
const destinations = [{ id: "d1", name: "Hastings", regionId: "r1" }];
const tags = [
  { id: "t1", name: "Fruit picking" },
  { id: "t2", name: "Rural" },
];
const travelStyles = ["budget", "comfort"];

describe("FilterBar", () => {
  it("renders every filter field with its options", () => {
    render(
      <FilterBar
        regions={regions}
        destinations={destinations}
        tags={tags}
        travelStyles={travelStyles}
        current={{}}
      />,
    );

    expect(screen.getByLabelText(/search/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/region/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/destination/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^tag$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/trip year/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/travel style/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/reported cost/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/cost availability/i)).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Hawke's Bay" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Fruit picking" }),
    ).toBeInTheDocument();
  });

  it("submits as a native GET form to /stories, never client-side fetch", () => {
    render(
      <FilterBar
        regions={regions}
        destinations={destinations}
        tags={tags}
        travelStyles={travelStyles}
        current={{}}
      />,
    );

    const form = screen
      .getByRole("button", { name: /apply filters/i })
      .closest("form");
    expect(form).toHaveAttribute("method", "get");
    expect(form).toHaveAttribute("action", "/stories");
  });

  it("the clear control links back to /stories with no filters carried over", () => {
    render(
      <FilterBar
        regions={regions}
        destinations={destinations}
        tags={tags}
        travelStyles={travelStyles}
        current={{ region: "r1", q: "apples" }}
      />,
    );

    expect(screen.getByRole("link", { name: /clear/i })).toHaveAttribute(
      "href",
      "/stories",
    );
  });

  describe("on a phone", () => {
    function pretendPhone() {
      Object.defineProperty(window, "matchMedia", {
        configurable: true,
        writable: true,
        value: (query: string) => ({
          matches: query.includes("max-width"),
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
        }),
      });
    }
    afterEach(() => {
      // @ts-expect-error -- jsdom has no matchMedia by default; remove the stub
      delete window.matchMedia;
    });

    function renderBar() {
      return render(
        <FilterBar
          regions={regions}
          destinations={destinations}
          tags={tags}
          travelStyles={travelStyles}
          current={{ region: "r1", q: "apples" }}
        />,
      );
    }

    it("opens the filters as a bottom sheet with Apply and Clear pinned in it", () => {
      pretendPhone();
      renderBar();
      const trigger = screen.getByRole("button", { name: "Filters" });
      expect(trigger).toHaveAttribute("aria-expanded", "false");
      expect(screen.getByRole("dialog", { hidden: true })).not.toHaveAttribute(
        "open",
      );

      fireEvent.click(trigger);

      const sheet = screen.getByRole("dialog", { name: "Filters" });
      expect(trigger).toHaveAttribute("aria-expanded", "true");
      expect(within(sheet).getByLabelText(/region/i)).toBeInTheDocument();
      expect(
        within(sheet).getByRole("button", { name: /apply filters/i }),
      ).toHaveAttribute("type", "submit");
      expect(
        within(sheet).getByRole("link", { name: /clear/i }),
      ).toHaveAttribute("href", "/stories");
    });

    it("keeps the same native GET form: sheet fields and the search box share one form", () => {
      pretendPhone();
      renderBar();
      fireEvent.click(screen.getByRole("button", { name: "Filters" }));

      const apply = screen.getByRole("button", { name: /apply filters/i });
      const form = apply.closest("form");
      expect(form).toHaveAttribute("method", "get");
      expect(form).toHaveAttribute("action", "/stories");
      expect(form).toContainElement(screen.getByLabelText(/search/i));
      expect(form).toContainElement(screen.getByLabelText(/region/i));
      // One copy of each field, never a sheet AND an inline duplicate.
      expect(screen.getAllByLabelText(/region/i)).toHaveLength(1);
      expect(new FormData(form as HTMLFormElement).get("region")).toBe("r1");
    });

    it("still submits the filters when the sheet has never been opened", () => {
      pretendPhone();
      renderBar();
      const form = screen.getByLabelText(/search/i).closest("form")!;
      const data = new FormData(form);
      expect(data.get("q")).toBe("apples");
      expect(data.get("region")).toBe("r1");
    });

    it("closes the sheet from its close button", () => {
      pretendPhone();
      renderBar();
      const trigger = screen.getByRole("button", { name: "Filters" });
      fireEvent.click(trigger);
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
      expect(trigger).toHaveAttribute("aria-expanded", "false");
    });
  });
});
