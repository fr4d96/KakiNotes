import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { CombinedFamilyExpenses } from "@/lib/story/family-expenses";
import { PublicExpenses } from "./public-expenses";

const YEAR = { tripStartDate: "2026-01-01", tripEndDate: "2026-12-31" };

describe("PublicExpenses", () => {
  it("renders nothing when the story recorded no money at all", () => {
    const { container } = render(
      <PublicExpenses
        totalCents={null}
        tripStartDate={null}
        tripEndDate={null}
        expenses={[]}
      />,
    );
    // An empty section announcing an absence is worse than no section: most
    // stories will never have this.
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a headline total on its own, with no breakdown", () => {
    render(<PublicExpenses totalCents={1_400_000} {...YEAR} expenses={[]} />);
    expect(screen.getByText("$14,000.00")).toBeInTheDocument();
    expect(
      screen.getByText(/reported for the whole trip/i),
    ).toBeInTheDocument();
  });

  it("shows the amounts in the revision's own currency", () => {
    render(
      <PublicExpenses
        totalCents={1_400_000}
        {...YEAR}
        expenses={[]}
        currency="CNY"
      />,
    );
    expect(screen.getByText("CN¥14,000.00")).toBeInTheDocument();
    expect(screen.queryByText("$14,000.00")).not.toBeInTheDocument();
  });

  it("derives a per-month figure from the trip dates", () => {
    render(<PublicExpenses totalCents={1_200_000} {...YEAR} expenses={[]} />);
    expect(screen.getByText(/a month across 12 months/i)).toBeInTheDocument();
  });

  it("stays silent about per-month when the story has no date range", () => {
    render(
      <PublicExpenses
        totalCents={1_200_000}
        tripStartDate={null}
        tripEndDate={null}
        expenses={[]}
      />,
    );
    expect(screen.queryByText(/a month across/i)).not.toBeInTheDocument();
  });

  it("stays silent about per-month on a trip too short to describe one", () => {
    render(
      <PublicExpenses
        totalCents={300_000}
        tripStartDate="2026-03-01"
        tripEndDate="2026-03-10"
        expenses={[]}
      />,
    );
    // $3,000 in 10 days is not "$9,132 a month" -- see expense-per-month.ts.
    expect(screen.queryByText(/a month across/i)).not.toBeInTheDocument();
  });

  it("renders the breakdown, folding a note in beside its category", () => {
    render(
      <PublicExpenses
        totalCents={500_000}
        {...YEAR}
        expenses={[
          { name: "Flights", amount_nzd_cents: 200_000, note: null },
          { name: "Other", amount_nzd_cents: 300_000, note: "Van repairs" },
        ]}
      />,
    );
    expect(screen.getAllByText("Flights")[0]).toBeInTheDocument();
    expect(screen.getAllByText("Other — Van repairs")[0]).toBeInTheDocument();
  });

  it("drops zero-amount rows rather than drawing empty slices", () => {
    render(
      <PublicExpenses
        totalCents={200_000}
        {...YEAR}
        expenses={[
          { name: "Flights", amount_nzd_cents: 200_000, note: null },
          { name: "Bond", amount_nzd_cents: 0, note: null },
        ]}
      />,
    );
    expect(screen.getAllByText("Flights")[0]).toBeInTheDocument();
    expect(screen.queryByText("Bond")).not.toBeInTheDocument();
  });

  it("renders a breakdown even when no headline total was recorded", () => {
    render(
      <PublicExpenses
        totalCents={null}
        {...YEAR}
        expenses={[{ name: "Flights", amount_nzd_cents: 200_000, note: null }]}
      />,
    );
    expect(screen.getAllByText("Flights")[0]).toBeInTheDocument();
    expect(
      screen.queryByText(/reported for the whole trip/i),
    ).not.toBeInTheDocument();
  });

  it("always says this is one person's record, not an estimate", () => {
    // Engineering Rule 17: money is the part of a story a reader is most
    // likely to mistake for advice.
    render(<PublicExpenses totalCents={1_400_000} {...YEAR} expenses={[]} />);
    expect(
      screen.getByText(/not a budget or an estimate/i),
    ).toBeInTheDocument();
  });
});

describe("PublicExpenses with sub stories", () => {
  const combined: CombinedFamilyExpenses = {
    totalCents: 650_000,
    expenses: [
      { name: "Rent", amount_nzd_cents: 400_000, note: null },
      { name: "Food", amount_nzd_cents: 250_000, note: null },
    ],
    tripStartDate: "2026-01-01",
    tripEndDate: "2026-12-31",
    perStory: [
      { title: "My year", slug: "my-year", totalCents: 500_000, isMain: true },
      {
        title: "Kiwi picking",
        slug: "kiwi",
        totalCents: 150_000,
        isMain: false,
      },
    ],
    skippedOtherCurrency: 0,
  };
  const own = {
    totalCents: 500_000,
    ...YEAR,
    expenses: [{ name: "Rent", amount_nzd_cents: 500_000, note: null }],
  };

  it("shows no switch without a combined breakdown", () => {
    render(<PublicExpenses {...own} />);
    expect(
      screen.queryByRole("button", { name: "Total Trip Cost" }),
    ).not.toBeInTheDocument();
  });

  it("opens on the story's own figures and switches to the combined ones", () => {
    render(<PublicExpenses {...own} combined={combined} basePath="/stories" />);
    const mine = screen.getByRole("button", { name: "This story" });
    const all = screen.getByRole("button", { name: "Total Trip Cost" });
    expect(mine).toHaveAttribute("aria-pressed", "true");
    // The combined total is rendered but hidden until chosen.
    expect(screen.getAllByText("$6,500.00")[0]).not.toBeVisible();
    expect(screen.getAllByText("$5,000.00")[0]).toBeVisible();

    fireEvent.click(all);
    expect(all).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/reported across 2 stories/i)).toBeVisible();
    // Per-story list: the main story unlinked, the sub story linked.
    expect(screen.getByRole("link", { name: "Kiwi picking" })).toHaveAttribute(
      "href",
      "/stories/kiwi",
    );
    expect(
      screen.queryByRole("link", { name: "My year" }),
    ).not.toBeInTheDocument();
    // The disclaimer stays outside both panels.
    expect(screen.getByText(/not a budget or an estimate/i)).toBeVisible();
  });

  it("says when a sub story in another currency was left out", () => {
    render(
      <PublicExpenses
        {...own}
        combined={{ ...combined, skippedOtherCurrency: 1 }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Total Trip Cost" }));
    expect(
      screen.getByText(
        /1 sub story recorded in another currency is not included/i,
      ),
    ).toBeVisible();
  });

  it("opens on the combined view when the main story recorded nothing", () => {
    render(
      <PublicExpenses
        totalCents={null}
        tripStartDate={null}
        tripEndDate={null}
        expenses={[]}
        combined={combined}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Total Trip Cost" }),
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "This story" }));
    expect(
      screen.getByText(/doesn’t record any costs of its own/i),
    ).toBeVisible();
  });
});

describe("PublicExpenses, compact", () => {
  const rows = [
    { name: "Fuel", amount_nzd_cents: 400, note: null },
    { name: "Vehicle", amount_nzd_cents: 300, note: null },
    { name: "Food", amount_nzd_cents: 200, note: null },
    { name: "Tolls", amount_nzd_cents: 100, note: null },
  ];

  it("names the three biggest categories up front", () => {
    const { container } = render(
      <PublicExpenses totalCents={1_000} {...YEAR} expenses={rows} />,
    );
    const summary = container.querySelector("section > ul");
    expect(summary?.textContent).toContain("Fuel40%");
    expect(summary?.textContent).toContain("Food20%");
    expect(summary?.textContent).not.toContain("Tolls");
  });

  it("keeps the full donut behind See full breakdown, closed by default", () => {
    const { container } = render(
      <PublicExpenses totalCents={1_000} {...YEAR} expenses={rows} />,
    );
    const details = container.querySelector("details");
    expect(details).not.toHaveAttribute("open");
    expect(details?.querySelector("summary")?.textContent).toMatch(
      /see full breakdown/i,
    );
    // The full legend, Tolls included, lives inside it.
    expect(details?.textContent).toContain("Tolls");
  });

  it("is a jump target for the section bar", () => {
    const { container } = render(
      <PublicExpenses totalCents={1_000} {...YEAR} expenses={rows} />,
    );
    expect(container.querySelector("section#costs")).not.toBeNull();
  });
});
