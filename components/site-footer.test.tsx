import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SiteFooter } from "./site-footer";

describe("SiteFooter", () => {
  it("carries the not-immigration/legal/financial-advice disclaimer sitewide", () => {
    render(<SiteFooter />);

    expect(
      screen.getByText(
        /does not provide immigration, legal, employment, tax, or financial advice/i,
      ),
    ).toBeInTheDocument();
  });

  it("links to all four legal placeholder pages", () => {
    render(<SiteFooter />);

    for (const label of [
      "Privacy",
      "Terms",
      "Guidelines",
      "Copyright & Removal",
    ]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("links to the real stories, contributors, and about routes", () => {
    render(<SiteFooter />);

    expect(screen.getByRole("link", { name: "Stories" })).toHaveAttribute(
      "href",
      "/stories",
    );
    expect(screen.getByRole("link", { name: "Contributors" })).toHaveAttribute(
      "href",
      "/contributors",
    );
  });
});

describe("SiteFooter in Simplified Chinese", () => {
  // Proves the wiring end to end for a Server Component: the same render,
  // the mocked request locale flipped to zh-CN, and the real
  // messages/zh-CN.json file behind it.
  it("renders the disclaimer and the legal links in Chinese", async () => {
    const { withTestLocale } = await import("@/tests/support/i18n");
    await withTestLocale("zh-CN", () => {
      render(<SiteFooter />);
    });

    expect(
      screen.getByText(/不提供移民、法律、就业、税务或财务建议/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "隐私" })).toHaveAttribute(
      "href",
      "/privacy",
    );
    expect(screen.getByRole("link", { name: "版权与移除" })).toHaveAttribute(
      "href",
      "/copyright",
    );
    expect(screen.getByRole("link", { name: "投稿人" })).toHaveAttribute(
      "href",
      "/contributors",
    );
  });
});
