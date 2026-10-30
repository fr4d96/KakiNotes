import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SiteFooter } from "./site-footer";

const { usePathnameMock } = vi.hoisted(() => ({
  usePathnameMock: vi.fn(() => "/"),
}));
vi.mock("next/navigation", () => ({ usePathname: usePathnameMock }));

beforeEach(() => {
  usePathnameMock.mockReturnValue("/");
});

describe("SiteFooter", () => {
  it("carries the not-immigration/legal/financial-advice disclaimer", () => {
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

describe("SiteFooter placement", () => {
  it("renders on the home pages only", () => {
    for (const path of ["/", "/cn", "/cn/"]) {
      usePathnameMock.mockReturnValue(path);
      const { container, unmount } = render(<SiteFooter />);
      expect(container.querySelector("footer"), path).not.toBeNull();
      unmount();
    }
  });

  it("renders nothing anywhere else", () => {
    for (const path of [
      "/stories",
      "/stories/some-story",
      "/contributors",
      "/about",
      "/privacy",
      "/cn/stories",
      "/sign-in",
    ]) {
      usePathnameMock.mockReturnValue(path);
      const { container, unmount } = render(<SiteFooter />);
      expect(container.innerHTML, path).toBe("");
      unmount();
    }
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

  it("on the /cn home, links to the China section and uses China copy", () => {
    usePathnameMock.mockReturnValue("/cn");
    render(<SiteFooter />);

    expect(screen.getByRole("link", { name: "Stories" })).toHaveAttribute(
      "href",
      "/cn/stories",
    );
    expect(screen.getByRole("link", { name: "Contributors" })).toHaveAttribute(
      "href",
      "/cn/contributors",
    );
    expect(
      screen.getByText("Made for travellers exploring China"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/working-holiday travellers in Aotearoa/i),
    ).not.toBeInTheDocument();
    // The not-advice disclaimer is on both home pages.
    expect(
      screen.getByText(/does not provide immigration/i),
    ).toBeInTheDocument();
  });
});
