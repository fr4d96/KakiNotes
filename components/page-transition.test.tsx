import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { usePathnameMock, viewTransitionSpy } = vi.hoisted(() => ({
  usePathnameMock: vi.fn(() => "/stories"),
  viewTransitionSpy: vi.fn(),
}));
vi.mock("next/navigation", () => ({ usePathname: usePathnameMock }));

// <ViewTransition> exists only in React's canary channel, which Next bundles
// for the App Router; the react package Vitest resolves does not export it.
// Stand in a pass-through that records its props.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    ViewTransition: (props: { children: React.ReactNode }) => {
      viewTransitionSpy(props);
      return props.children;
    },
  };
});

import { PageTransition, navDirection } from "./page-transition";

beforeEach(() => {
  viewTransitionSpy.mockClear();
  usePathnameMock.mockReturnValue("/stories");
});

describe("navDirection", () => {
  it("is forward when the destination is deeper", () => {
    expect(navDirection("/stories", "/stories/a-story")).toBe("forward");
    expect(navDirection("/my-stories", "/stories/abc/edit")).toBe("forward");
    expect(navDirection("/contributors", "/contributors/ana")).toBe("forward");
    expect(navDirection("/", "/stories")).toBe("forward");
  });

  it("is back when the destination is shallower", () => {
    expect(navDirection("/stories/a-story", "/stories")).toBe("back");
    expect(navDirection("/stories/abc/edit", "/my-stories")).toBe("back");
  });

  it("is a sibling move at the same depth", () => {
    expect(navDirection("/stories", "/contributors")).toBe("sibling");
    expect(navDirection("/", "/")).toBe("sibling");
  });

  it("ignores the /cn country prefix", () => {
    expect(navDirection("/cn", "/cn/stories")).toBe("forward");
    expect(navDirection("/cn/stories/x", "/cn/stories")).toBe("back");
    expect(navDirection("/stories", "/cn/stories")).toBe("sibling");
  });
});

describe("PageTransition", () => {
  it("renders its children inside an unstyled wrapper", () => {
    render(
      <PageTransition>
        <p>page</p>
      </PageTransition>,
    );
    const wrapper = screen.getByText("page").parentElement;
    expect(wrapper?.tagName).toBe("DIV");
    expect(wrapper?.className).toBe("");
  });

  it("keys the boundary by pathname and maps types to classes", () => {
    const { rerender } = render(
      <PageTransition>
        <p>page</p>
      </PageTransition>,
    );
    usePathnameMock.mockReturnValue("/stories/a-story");
    viewTransitionSpy.mockClear();
    rerender(
      <PageTransition>
        <p>page</p>
      </PageTransition>,
    );
    const props = viewTransitionSpy.mock.calls.at(-1)?.[0];
    expect(props.enter).toMatchObject({
      tab: "vt-fade",
      "nav-forward": "vt-in-forward",
      "nav-back": "vt-in-back",
      default: "vt-in-forward", // /stories -> /stories/a-story is deeper
    });
    expect(props.exit).toMatchObject({ tab: "vt-fade", default: "vt-out" });
    expect(props.default).toBe("none");
  });

  it("enters from the left when the destination is shallower", () => {
    usePathnameMock.mockReturnValue("/stories/a-story");
    const { rerender } = render(
      <PageTransition>
        <p>page</p>
      </PageTransition>,
    );
    usePathnameMock.mockReturnValue("/stories");
    viewTransitionSpy.mockClear();
    rerender(
      <PageTransition>
        <p>page</p>
      </PageTransition>,
    );
    expect(viewTransitionSpy.mock.calls.at(-1)?.[0].enter.default).toBe(
      "vt-in-back",
    );
  });
});
