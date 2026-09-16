import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  HeroField,
  layoutPoints,
  pointPosition,
  type HeroRecord,
} from "@/components/home/hero-field";

function makeRecords(count: number): HeroRecord[] {
  return Array.from({ length: count }, (_, i) => ({
    slug: `story-${i}`,
    title: `Story ${i}`,
    record: `Region ${i} · Work · 2025`,
  }));
}

beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  // jsdom has no canvas backend; stub getContext to silence the "not
  // implemented" warning. The component already guards `if (!ctx) return;`.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

describe("HeroField", () => {
  it("renders one link per record inside a list labeled with listLabel", () => {
    const records = makeRecords(3);
    render(<HeroField records={records} listLabel="Featured stories" />);

    const list = screen.getByRole("list", { name: "Featured stories" });
    expect(screen.getAllByRole("link")).toHaveLength(3);

    records.forEach((record) => {
      const link = screen.getByRole("link", {
        name: `${record.title} — ${record.record}`,
      });
      expect(link).toHaveAttribute("href", `/stories/${record.slug}`);
      expect(list).toContainElement(link);
    });
  });

  it("renders no list at all when records is empty", () => {
    expect(() =>
      render(<HeroField records={[]} listLabel="Featured stories" />),
    ).not.toThrow();
    expect(screen.queryByRole("list")).toBeNull();
  });

  describe("pointPosition", () => {
    it("is deterministic for the same inputs", () => {
      expect(pointPosition("a-slug", 3, 24)).toEqual(
        pointPosition("a-slug", 3, 24),
      );
    });

    it("stays inside the field bounds for every index of a 24-record set", () => {
      const total = 24;
      for (let index = 0; index < total; index++) {
        const { left, top } = pointPosition(`slug-${index}`, index, total);
        expect(left).toBeGreaterThanOrEqual(0.06);
        expect(left).toBeLessThanOrEqual(0.94);
        expect(top).toBeGreaterThanOrEqual(0.12);
        expect(top).toBeLessThanOrEqual(0.88);
      }
    });

    it("gives two different slugs at the same index/total different positions", () => {
      expect(pointPosition("slug-a", 5, 24)).not.toEqual(
        pointPosition("slug-b", 5, 24),
      );
    });
  });

  it("lays points out by slug, not by arrival order", () => {
    const records = makeRecords(24);
    const shuffled = [...records].reverse();
    const a = layoutPoints(records);
    const b = layoutPoints(shuffled);
    for (const record of records) {
      expect(b.get(record.slug)).toEqual(a.get(record.slug));
    }
  });

  it("marks each <li> with data-side derived from layoutPoints", () => {
    const records = makeRecords(24);
    const positions = layoutPoints(records);
    render(<HeroField records={records} listLabel="Featured stories" />);

    records.forEach((record) => {
      const { left } = positions.get(record.slug)!;
      const expectedSide = left > 0.66 ? "end" : "start";
      const link = screen.getByRole("link", {
        name: `${record.title} — ${record.record}`,
      });
      expect(link.closest("li")).toHaveAttribute("data-side", expectedSide);
    });
  });
});
